import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";

import prisma from "../db.server";
import { requireEntitlement } from "../billing/entitlement-service.server";
import { isOperationAllowed } from "../operations/safety-controls.server";
import { normalizeShopDomain } from "../tenancy/shop-domain";
import { createCsv } from "./csv";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function activeShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: normalizeShopDomain(shopDomain) },
  });
  if (!shop || shop.status !== "ACTIVE") throw new Error("shop_inactive");
  return shop;
}

export async function createAgingCsvExport(shopDomain: string): Promise<string> {
  const shop = await activeShop(shopDomain);
  await requireEntitlement(shop.id, "EXPORT_CSV");
  const receivables = await prisma.receivable.findMany({
    where: { shopId: shop.id },
    include: {
      company: { select: { displayName: true } },
      collectionActions: {
        select: { safeSummary: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      promisesToPay: {
        where: { status: "OPEN" },
        select: { promisedAt: true },
        orderBy: { promisedAt: "asc" },
        take: 1,
      },
      reminderDeliveries: {
        select: { state: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ currency: "asc" }, { dueAt: "asc" }, { id: "asc" }],
  });
  return createCsv([
    [
      "Company",
      "Order",
      "Shopify status",
      "Outstanding amount",
      "Currency",
      "Due date",
      "Days overdue",
      "Aging bucket",
      "Latest collection activity",
      "Open promise date",
      "Latest reminder state",
      "Last observed",
    ],
    ...receivables.map((receivable) => [
      receivable.company?.displayName ?? "",
      receivable.orderName,
      receivable.status,
      receivable.outstandingAmount.toFixed(4),
      receivable.currency,
      receivable.dueAt?.toISOString() ?? "",
      receivable.daysOverdue?.toString() ?? "",
      receivable.agingBucket ?? "REVIEW",
      receivable.collectionActions[0]?.safeSummary ?? "",
      receivable.promisesToPay[0]?.promisedAt.toISOString() ?? "",
      receivable.reminderDeliveries[0]?.state ?? "",
      receivable.lastObservedAt.toISOString(),
    ]),
  ]);
}

export async function createCompanyStatement(input: {
  shopDomain: string;
  companyId: string;
  actorId?: string;
  correlationId: string;
}): Promise<{ html: string; filename: string }> {
  const shop = await activeShop(input.shopDomain);
  const [operationAllowed] = await Promise.all([
    isOperationAllowed(shop.id, "STATEMENTS"),
    requireEntitlement(shop.id, "GENERATE_STATEMENT"),
  ]);
  if (!operationAllowed) throw new Error("statements_safety_blocked");
  const company = await prisma.company.findFirst({
    where: { id: input.companyId, shopId: shop.id },
    include: {
      receivables: {
        where: { status: { in: ["OPEN", "REFUNDED"] } },
        orderBy: [{ currency: "asc" }, { dueAt: "asc" }],
      },
    },
  });
  if (!company) throw new Error("company_not_found");
  const asOf = new Date();
  const currencySet = [...new Set(company.receivables.map((item) => item.currency))];
  const totals = new Map<string, string>();
  for (const currency of currencySet) {
    const total = company.receivables
      .filter((item) => item.currency === currency)
      .reduce(
        (sum, item) => sum.add(item.outstandingAmount),
        new Prisma.Decimal(0),
      );
    totals.set(currency, total.toFixed(2));
  }
  const rows = company.receivables
    .map(
      (item) => `<tr><td>${escapeHtml(item.orderName)}</td><td>${escapeHtml(
        item.issuedAt?.toISOString().slice(0, 10) ?? "—",
      )}</td><td>${escapeHtml(item.dueAt?.toISOString().slice(0, 10) ?? "Review required")}</td><td>${escapeHtml(
        item.outstandingAmount.toFixed(2),
      )} ${escapeHtml(item.currency)}</td></tr>`,
    )
    .join("");
  const totalRows = currencySet
    .map(
      (currency) =>
        `<li><strong>${escapeHtml(totals.get(currency) ?? "0.00")} ${escapeHtml(currency)}</strong></li>`,
    )
    .join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Account statement</title><style>body{font:14px/1.5 system-ui,sans-serif;color:#202223;max-width:900px;margin:40px auto;padding:0 24px}header{border-bottom:2px solid #008060;padding-bottom:18px;margin-bottom:24px}h1{margin:0 0 6px}small{color:#6d7175}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{border-bottom:1px solid #ddd;padding:10px;text-align:left}th{background:#f6f6f7}ul{list-style:none;padding:0}.notice{background:#fff8e5;padding:12px;border:1px solid #f0d279}@media print{body{margin:0}.notice{break-inside:avoid}}</style></head><body><header><small>${escapeHtml(shop.shopDomain)}</small><h1>Account statement</h1><p>${escapeHtml(company.displayName)}</p><small>Generated ${escapeHtml(asOf.toISOString())}</small></header><p class="notice">Balances and payment state are based on the latest synchronized Shopify data. This statement does not modify Shopify.</p><table><thead><tr><th>Order</th><th>Issued</th><th>Due</th><th>Outstanding</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No open receivables.</td></tr>'}</tbody></table><h2>Totals by currency</h2><ul>${totalRows || "<li>Nothing outstanding</li>"}</ul></body></html>`;
  const contentHash = createHash("sha256").update(html).digest("hex");
  await prisma.$transaction(async (transaction) => {
    const run = await transaction.statementRun.create({
      data: {
        shopId: shop.id,
        companyId: company.id,
        asOf,
        currencySet,
        includedReceivableIds: company.receivables.map((item) => item.id),
        contentHash,
        createdBy: input.actorId,
      },
    });
    await transaction.collectionAction.create({
      data: {
        shopId: shop.id,
        companyId: company.id,
        type: "STATEMENT_GENERATED",
        safeSummary: "Account statement generated",
        actorId: input.actorId,
      },
    });
    await transaction.auditEvent.create({
      data: {
        shopId: shop.id,
        actorType: "MERCHANT",
        actorId: input.actorId,
        action: "statement.generated",
        targetType: "statement_run",
        targetId: run.id,
        safeAfter: { currencyCount: currencySet.length, receivableCount: company.receivables.length },
        reason: "merchant_request",
        correlationId: input.correlationId,
      },
    });
  });
  return {
    html,
    filename: `statement-${company.id}-${asOf.toISOString().slice(0, 10)}.html`,
  };
}
