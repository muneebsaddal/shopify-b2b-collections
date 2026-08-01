import type { ShopSyncStatus } from "@prisma/client";

import prisma from "../../db.server";
import { ShopRepository } from "../../tenancy/shop-repository.server";
import { buildAgingDashboard } from "./aging";

export type AgingFilters = {
  company: string;
  status: "all" | "overdue" | "current";
  currency: string;
  age: "all" | "current" | "1-30" | "31-60" | "61-90" | "90+";
  amountMin: string;
  amountMax: string;
  dueFrom: string;
  dueTo: string;
};

export type AgingDashboardData = ReturnType<typeof buildAgingDashboard> & {
  shop: {
    syncStatus: ShopSyncStatus;
    lastReconciledAt: string | null;
    latestWork: {
      state: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
      errorCode: string | null;
      createdAt: string;
    } | null;
  };
  filters: AgingFilters;
  generatedAt: string;
};

const validAges = new Set<AgingFilters["age"]>([
  "all",
  "current",
  "1-30",
  "31-60",
  "61-90",
  "90+",
]);
const validStatuses = new Set<AgingFilters["status"]>([
  "all",
  "overdue",
  "current",
]);

function boundedText(value: string | null, maximum = 120): string {
  return value?.trim().slice(0, maximum) ?? "";
}

function validAmount(value: string): string {
  if (!value || !/^\d{1,16}(?:\.\d{1,4})?$/.test(value)) return "";
  return value;
}

function validDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

export function agingFiltersFromUrl(url: URL): AgingFilters {
  const age = boundedText(url.searchParams.get("age"));
  const status = boundedText(url.searchParams.get("status"));
  return {
    company: boundedText(url.searchParams.get("company")),
    status: validStatuses.has(status as AgingFilters["status"])
      ? (status as AgingFilters["status"])
      : "all",
    currency: boundedText(url.searchParams.get("currency"), 3).toUpperCase(),
    age: validAges.has(age as AgingFilters["age"])
      ? (age as AgingFilters["age"])
      : "all",
    amountMin: validAmount(boundedText(url.searchParams.get("amountMin"), 24)),
    amountMax: validAmount(boundedText(url.searchParams.get("amountMax"), 24)),
    dueFrom: validDate(boundedText(url.searchParams.get("dueFrom"), 10)),
    dueTo: validDate(boundedText(url.searchParams.get("dueTo"), 10)),
  };
}

function matchesAge(daysOverdue: number, age: AgingFilters["age"]): boolean {
  if (age === "all") return true;
  if (age === "current") return daysOverdue <= 0;
  if (age === "1-30") return daysOverdue >= 1 && daysOverdue <= 30;
  if (age === "31-60") return daysOverdue >= 31 && daysOverdue <= 60;
  if (age === "61-90") return daysOverdue >= 61 && daysOverdue <= 90;
  return daysOverdue >= 91;
}

function filterReceivables(
  data: ReturnType<typeof buildAgingDashboard>,
  filters: AgingFilters,
) {
  const company = filters.company.toLocaleLowerCase();
  const amountMin = filters.amountMin ? Number(filters.amountMin) : undefined;
  const amountMax = filters.amountMax ? Number(filters.amountMax) : undefined;

  return data.receivables.filter((receivable) => {
    const amount = Number(receivable.outstandingAmount);
    return (
      (!company || receivable.companyName?.toLocaleLowerCase().includes(company)) &&
      (filters.status === "all" ||
        (filters.status === "overdue" && receivable.daysOverdue > 0) ||
        (filters.status === "current" && receivable.daysOverdue <= 0)) &&
      (!filters.currency || receivable.currency === filters.currency) &&
      matchesAge(receivable.daysOverdue, filters.age) &&
      (amountMin === undefined || amount >= amountMin) &&
      (amountMax === undefined || amount <= amountMax) &&
      (!filters.dueFrom || receivable.dueDate >= filters.dueFrom) &&
      (!filters.dueTo || receivable.dueDate <= filters.dueTo)
    );
  });
}

export async function loadAgingDashboard(
  shopDomain: string,
  filters: AgingFilters,
): Promise<AgingDashboardData | null> {
  const shop = await new ShopRepository(prisma).findByDomain(shopDomain);
  if (!shop) return null;

  const [receivables, latestWork] = await Promise.all([
    prisma.receivable.findMany({
      where: {
        shopId: shop.id,
        OR: [
          { status: "OPEN" },
          {
            status: "PAID",
            lastObservedAt: {
              gte: new Date(Date.now() - 7 * 86_400_000),
            },
          },
        ],
      },
      include: { company: { select: { displayName: true } } },
      orderBy: [{ dueAt: "asc" }, { orderName: "asc" }],
    }),
    prisma.syncWorkItem.findFirst({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      select: {
        state: true,
        errorCode: true,
        createdAt: true,
      },
    }),
  ]);
  const now = new Date();
  const dashboard = buildAgingDashboard({
    timezone: shop.timezone,
    now,
    receivables: receivables.map((receivable) => ({
      id: receivable.id,
      companyId: receivable.companyId,
      companyName: receivable.company?.displayName ?? null,
      orderName: receivable.orderName,
      status: receivable.status,
      outstandingAmount: receivable.outstandingAmount.toString(),
      originalTotal: receivable.originalTotal.toString(),
      currency: receivable.currency,
      dueAt: receivable.dueAt,
      lastObservedAt: receivable.lastObservedAt,
    })),
  });

  return {
    ...dashboard,
    receivables: filterReceivables(dashboard, filters),
    shop: {
      syncStatus: shop.syncStatus,
      lastReconciledAt: shop.lastReconciledAt?.toISOString() ?? null,
      latestWork: latestWork
        ? {
            state: latestWork.state,
            errorCode: latestWork.errorCode,
            createdAt: latestWork.createdAt.toISOString(),
          }
        : null,
    },
    filters,
    generatedAt: now.toISOString(),
  };
}
