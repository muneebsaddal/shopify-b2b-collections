import { createHmac } from "node:crypto";

import {
  Prisma,
  type PrismaClient,
  type ReceivableStatus,
} from "@prisma/client";

import { agingForDueDate } from "../features/receivables/aging";
import { AuditRepository } from "../operations/audit-repository.server";
import { encryptSessionSecret } from "../platform/security/encryption.server";

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

type Money = { amount?: string; currencyCode?: string };
type PageInfo = { hasNextPage: boolean; endCursor?: string | null };

export type CompanyNode = {
  id: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type CompanyLocationNode = {
  id: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  company?: { id?: string };
};

export type CompanyContactNode = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  company?: { id?: string };
  customer?: {
    id?: string;
    defaultEmailAddress?: { emailAddress?: string | null } | null;
  } | null;
};

export type OrderNode = {
  id: string;
  name?: string;
  createdAt?: string;
  updatedAt?: string;
  cancelledAt?: string | null;
  closedAt?: string | null;
  displayFinancialStatus?: string | null;
  totalPriceSet?: { shopMoney?: Money };
  totalOutstandingSet?: { shopMoney?: Money };
  totalRefundedSet?: { shopMoney?: Money };
  currencyCode?: string;
  paymentTerms?: {
    paymentTermsType?: string;
    paymentSchedules?: {
      pageInfo?: PageInfo;
      nodes?: Array<{
        id: string;
        balanceDue?: Money;
        totalBalance?: Money;
        dueAt?: string | null;
        issuedAt?: string | null;
        completedAt?: string | null;
      }>;
    };
  } | null;
  purchasingEntity?: {
    company?: { id?: string };
    location?: { id?: string };
    contact?: { id?: string };
  } | null;
};

function asDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

function normalizedEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const email = value.trim().toLocaleLowerCase();
  if (
    email.length > 320 ||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
  ) {
    return null;
  }
  return email;
}

function contactEmailContext(
  shopId: string,
  shopifyContactGid: string,
): string {
  return `company-contact:${shopId}:${shopifyContactGid}:email`;
}

function emailHmac(email: string): string {
  const encodedKey = process.env.SESSION_ENCRYPTION_KEY;
  if (!encodedKey) throw new Error("SESSION_ENCRYPTION_KEY is required");
  const key = Buffer.from(encodedKey, "base64");
  if (key.length !== 32) {
    throw new Error("SESSION_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return createHmac("sha256", key)
    .update("protected-email:v1:")
    .update(email)
    .digest("hex");
}

export function isInScopeReceivable(order: OrderNode): boolean {
  return Boolean(
    order.paymentTerms &&
      order.purchasingEntity?.company?.id &&
      order.totalOutstandingSet?.shopMoney?.amount !== undefined,
  );
}

export function statusForOrder(order: OrderNode): ReceivableStatus {
  if (order.cancelledAt) return "CANCELED";
  const outstanding = order.totalOutstandingSet?.shopMoney?.amount;
  if (outstanding !== undefined && new Prisma.Decimal(outstanding).isZero()) {
    const refunded = order.totalRefundedSet?.shopMoney?.amount;
    if (refunded && new Prisma.Decimal(refunded).greaterThan(0)) return "REFUNDED";
    return "PAID";
  }
  if (order.closedAt) return "CLOSED";
  return "OPEN";
}

export async function projectCompanies(
  database: DatabaseClient,
  input: {
    shopId: string;
    nodes: CompanyNode[];
    observedAt: Date;
  },
): Promise<void> {
  for (const node of input.nodes) {
    await database.company.upsert({
      where: {
        shopId_shopifyCompanyGid: {
          shopId: input.shopId,
          shopifyCompanyGid: node.id,
        },
      },
      create: {
        shopId: input.shopId,
        shopifyCompanyGid: node.id,
        displayName: node.name?.trim() || "Shopify company",
        status: "ACTIVE",
        shopifyUpdatedAt: asDate(node.updatedAt),
        lastObservedAt: input.observedAt,
        reconciledAt: input.observedAt,
      },
      update: {
        displayName: node.name?.trim() || "Shopify company",
        status: "ACTIVE",
        shopifyUpdatedAt: asDate(node.updatedAt),
        lastObservedAt: input.observedAt,
        reconciledAt: input.observedAt,
      },
    });
  }
}

export async function projectCompanyLocations(
  database: DatabaseClient,
  input: {
    shopId: string;
    companyGid: string;
    nodes: CompanyLocationNode[];
    observedAt: Date;
  },
): Promise<void> {
  const company = await database.company.findUnique({
    where: {
      shopId_shopifyCompanyGid: {
        shopId: input.shopId,
        shopifyCompanyGid: input.companyGid,
      },
    },
    select: { id: true },
  });
  if (!company) throw new Error("company_projection_missing");

  for (const node of input.nodes) {
    if (node.company?.id && node.company.id !== input.companyGid) {
      throw new Error("company_location_parent_mismatch");
    }
    await database.companyLocation.upsert({
      where: {
        shopId_shopifyLocationGid: {
          shopId: input.shopId,
          shopifyLocationGid: node.id,
        },
      },
      create: {
        shopId: input.shopId,
        companyId: company.id,
        shopifyLocationGid: node.id,
        displayLabel: node.name?.trim() || null,
        status: "ACTIVE",
        shopifyUpdatedAt: asDate(node.updatedAt),
        lastObservedAt: input.observedAt,
      },
      update: {
        companyId: company.id,
        displayLabel: node.name?.trim() || null,
        status: "ACTIVE",
        shopifyUpdatedAt: asDate(node.updatedAt),
        lastObservedAt: input.observedAt,
      },
    });
  }
}

export async function projectCompanyContacts(
  database: DatabaseClient,
  input: {
    shopId: string;
    companyGid: string;
    nodes: CompanyContactNode[];
    observedAt: Date;
  },
): Promise<void> {
  const company = await database.company.findUnique({
    where: {
      shopId_shopifyCompanyGid: {
        shopId: input.shopId,
        shopifyCompanyGid: input.companyGid,
      },
    },
    select: { id: true },
  });
  if (!company) throw new Error("company_projection_missing");

  for (const node of input.nodes) {
    if (node.company?.id && node.company.id !== input.companyGid) {
      throw new Error("company_contact_parent_mismatch");
    }
    const email = normalizedEmail(
      node.customer?.defaultEmailAddress?.emailAddress,
    );
    await database.companyContact.upsert({
      where: {
        shopId_shopifyContactGid: {
          shopId: input.shopId,
          shopifyContactGid: node.id,
        },
      },
      create: {
        shopId: input.shopId,
        companyId: company.id,
        shopifyContactGid: node.id,
        shopifyCustomerGid: node.customer?.id,
        encryptedEmail: email
          ? encryptSessionSecret(
              email,
              contactEmailContext(input.shopId, node.id),
            )
          : null,
        emailHmac: email ? emailHmac(email) : null,
        emailValid: Boolean(email),
        status: "ACTIVE",
        shopifyUpdatedAt: asDate(node.updatedAt),
        lastObservedAt: input.observedAt,
        redactedAt: null,
      },
      update: {
        companyId: company.id,
        shopifyCustomerGid: node.customer?.id,
        encryptedEmail: email
          ? encryptSessionSecret(
              email,
              contactEmailContext(input.shopId, node.id),
            )
          : null,
        emailHmac: email ? emailHmac(email) : null,
        emailValid: Boolean(email),
        status: "ACTIVE",
        shopifyUpdatedAt: asDate(node.updatedAt),
        lastObservedAt: input.observedAt,
        redactedAt: null,
      },
    });
  }
}

export async function projectOrders(
  database: DatabaseClient,
  input: {
    shopId: string;
    timezone: string;
    nodes: OrderNode[];
    observedAt: Date;
    correlationId: string;
  },
): Promise<void> {
  const companyGids = [
    ...new Set(
      input.nodes.flatMap((node) =>
        node.purchasingEntity?.company?.id
          ? [node.purchasingEntity.company.id]
          : [],
      ),
    ),
  ];
  const locationGids = [
    ...new Set(
      input.nodes.flatMap((node) =>
        node.purchasingEntity?.location?.id
          ? [node.purchasingEntity.location.id]
          : [],
      ),
    ),
  ];
  const [companies, locations] = await Promise.all([
    database.company.findMany({
      where: {
        shopId: input.shopId,
        shopifyCompanyGid: { in: companyGids },
      },
      select: { id: true, shopifyCompanyGid: true },
    }),
    database.companyLocation.findMany({
      where: {
        shopId: input.shopId,
        shopifyLocationGid: { in: locationGids },
      },
      select: { id: true, shopifyLocationGid: true },
    }),
  ]);
  const companyByGid = new Map(
    companies.map((company) => [company.shopifyCompanyGid, company.id]),
  );
  const locationByGid = new Map(
    locations.map((location) => [location.shopifyLocationGid, location.id]),
  );

  for (const order of input.nodes) {
    const current = await database.receivable.findUnique({
      where: {
        shopId_shopifyOrderGid: {
          shopId: input.shopId,
          shopifyOrderGid: order.id,
        },
      },
    });
    const incomingUpdatedAt = asDate(order.updatedAt);
    if (
      current?.shopifyUpdatedAt &&
      incomingUpdatedAt &&
      incomingUpdatedAt < current.shopifyUpdatedAt
    ) {
      continue;
    }

    if (!isInScopeReceivable(order)) {
      if (current && current.status !== "CLOSED") {
        await database.receivable.update({
          where: { id: current.id },
          data: {
            status: "CLOSED",
            lastObservedAt: input.observedAt,
            reconciledAt: input.observedAt,
            shopifyUpdatedAt: incomingUpdatedAt,
          },
        });
        await database.receivableStateTransition.create({
          data: {
            shopId: input.shopId,
            receivableId: current.id,
            previousStatus: current.status,
            currentStatus: "CLOSED",
            previousBalance: current.outstandingAmount,
            currentBalance: current.outstandingAmount,
            reason: "shopify_order_left_payment_terms_scope",
            sourceOccurredAt: incomingUpdatedAt,
            correlationId: input.correlationId,
          },
        });
      }
      continue;
    }

    const outstandingMoney = order.totalOutstandingSet?.shopMoney;
    const totalMoney = order.totalPriceSet?.shopMoney;
    const currency =
      outstandingMoney?.currencyCode ??
      totalMoney?.currencyCode ??
      order.currencyCode;
    if (
      !currency ||
      outstandingMoney?.amount === undefined ||
      totalMoney?.amount === undefined
    ) {
      throw new Error("authoritative_money_missing");
    }
    if (order.paymentTerms?.paymentSchedules?.pageInfo?.hasNextPage) {
      throw new Error("payment_schedule_page_incomplete");
    }

    const schedules = order.paymentTerms?.paymentSchedules?.nodes ?? [];
    const dueAt = schedules
      .map((schedule) => asDate(schedule.dueAt))
      .find((value): value is Date => Boolean(value));
    const aging = dueAt
      ? agingForDueDate(dueAt, input.observedAt, input.timezone)
      : undefined;
    const status = statusForOrder(order);
    const companyGid = order.purchasingEntity?.company?.id;
    const locationGid = order.purchasingEntity?.location?.id;
    const receivable = await database.receivable.upsert({
      where: {
        shopId_shopifyOrderGid: {
          shopId: input.shopId,
          shopifyOrderGid: order.id,
        },
      },
      create: {
        shopId: input.shopId,
        shopifyOrderGid: order.id,
        companyId: companyGid ? companyByGid.get(companyGid) : undefined,
        companyLocationId: locationGid
          ? locationByGid.get(locationGid)
          : undefined,
        orderName: order.name ?? order.id,
        status,
        originalTotal: totalMoney.amount,
        outstandingAmount: outstandingMoney.amount,
        currency,
        issuedAt: asDate(order.createdAt),
        dueAt,
        daysOverdue: aging?.daysOverdue,
        agingBucket: aging?.bucket,
        paymentTermsType: order.paymentTerms?.paymentTermsType,
        shopifyUpdatedAt: incomingUpdatedAt,
        lastObservedAt: input.observedAt,
        reconciledAt: input.observedAt,
      },
      update: {
        companyId: companyGid ? companyByGid.get(companyGid) : null,
        companyLocationId: locationGid
          ? locationByGid.get(locationGid) ?? null
          : null,
        orderName: order.name ?? order.id,
        status,
        originalTotal: totalMoney.amount,
        outstandingAmount: outstandingMoney.amount,
        currency,
        issuedAt: asDate(order.createdAt),
        dueAt,
        daysOverdue: aging?.daysOverdue,
        agingBucket: aging?.bucket,
        paymentTermsType: order.paymentTerms?.paymentTermsType,
        shopifyUpdatedAt: incomingUpdatedAt,
        lastObservedAt: input.observedAt,
        reconciledAt: input.observedAt,
      },
    });

    await database.paymentSchedule.deleteMany({
      where: { shopId: input.shopId, receivableId: receivable.id },
    });
    if (schedules.length > 0) {
      await database.paymentSchedule.createMany({
        data: schedules.map((schedule) => ({
          shopId: input.shopId,
          receivableId: receivable.id,
          shopifyScheduleGid: schedule.id,
          balanceDue: schedule.balanceDue?.amount ?? "0",
          totalBalance: schedule.totalBalance?.amount ?? "0",
          currency: schedule.balanceDue?.currencyCode ?? currency,
          dueAt: asDate(schedule.dueAt),
          issuedAt: asDate(schedule.issuedAt),
          completedAt: asDate(schedule.completedAt),
          shopifyUpdatedAt: incomingUpdatedAt,
          lastObservedAt: input.observedAt,
        })),
      });
    }

    if (
      !current ||
      current.status !== status ||
      !current.outstandingAmount.equals(outstandingMoney.amount)
    ) {
      await database.receivableStateTransition.create({
        data: {
          shopId: input.shopId,
          receivableId: receivable.id,
          previousStatus: current?.status,
          currentStatus: status,
          previousBalance: current?.outstandingAmount,
          currentBalance: outstandingMoney.amount,
          reason: "shopify_authoritative_refresh",
          sourceOccurredAt: incomingUpdatedAt,
          correlationId: input.correlationId,
        },
      });
    }
    await new AuditRepository(database, input.shopId).append({
      actorType: "WORKER",
      action: "sync.receivable_projected",
      targetType: "receivable",
      targetId: receivable.id,
      safeAfter: { status, currency },
      reason: "shopify_authoritative_refresh",
      correlationId: input.correlationId,
    });
  }
}

export async function repairProjectionDrift(
  database: DatabaseClient,
  input: {
    shopId: string;
    sweepStartedAt: Date;
    correlationId: string;
  },
): Promise<number> {
  const staleReceivables = await database.receivable.findMany({
    where: {
      shopId: input.shopId,
      lastObservedAt: { lt: input.sweepStartedAt },
      status: { notIn: ["CLOSED", "CANCELED"] },
    },
    select: {
      id: true,
      status: true,
      outstandingAmount: true,
    },
  });

  const [companies, locations, contacts] = await Promise.all([
    database.company.updateMany({
      where: {
        shopId: input.shopId,
        status: "ACTIVE",
        lastObservedAt: { lt: input.sweepStartedAt },
      },
      data: { status: "DELETED" },
    }),
    database.companyLocation.updateMany({
      where: {
        shopId: input.shopId,
        status: "ACTIVE",
        lastObservedAt: { lt: input.sweepStartedAt },
      },
      data: { status: "DELETED" },
    }),
    database.companyContact.updateMany({
      where: {
        shopId: input.shopId,
        status: "ACTIVE",
        lastObservedAt: { lt: input.sweepStartedAt },
      },
      data: {
        status: "DELETED",
        encryptedEmail: null,
        emailHmac: null,
        emailValid: false,
      },
    }),
  ]);

  for (const receivable of staleReceivables) {
    await database.receivable.update({
      where: { id: receivable.id },
      data: { status: "CLOSED", reconciledAt: input.sweepStartedAt },
    });
    await database.receivableStateTransition.create({
      data: {
        shopId: input.shopId,
        receivableId: receivable.id,
        previousStatus: receivable.status,
        currentStatus: "CLOSED",
        previousBalance: receivable.outstandingAmount,
        currentBalance: receivable.outstandingAmount,
        reason: "shopify_reconciliation_absence",
        sourceOccurredAt: input.sweepStartedAt,
        correlationId: input.correlationId,
      },
    });
  }

  return (
    companies.count +
    locations.count +
    contacts.count +
    staleReceivables.length
  );
}
