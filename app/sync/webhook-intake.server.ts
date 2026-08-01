import { createHash } from "node:crypto";

import { Prisma, type SyncWorkKind } from "@prisma/client";

import prisma from "../db.server";
import { AuditRepository } from "../operations/audit-repository.server";
import { normalizeShopDomain } from "../tenancy/shop-domain";

const MAX_WEBHOOK_BYTES = 512 * 1024;
const SHOPIFY_PROVIDER = "shopify";

type WebhookHeaders = {
  webhookId: string;
  eventId?: string;
  apiVersion?: string;
  triggeredAt?: Date;
};

type WebhookTarget = { resourceType: string; resourceGid?: string };

export class WebhookPayloadTooLargeError extends Error {}
export class UnsupportedSyncWebhookError extends Error {}

export function assertWebhookSize(request: Request): void {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return;
  const parsed = Number(contentLength);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > MAX_WEBHOOK_BYTES
  ) {
    throw new WebhookPayloadTooLargeError();
  }
}

export function headersFromRequest(request: Request): WebhookHeaders {
  const webhookId = request.headers.get("x-shopify-webhook-id");
  if (!webhookId || webhookId.length > 255)
    throw new UnsupportedSyncWebhookError();

  const triggeredAt = request.headers.get("x-shopify-triggered-at");
  const parsedTriggeredAt = triggeredAt ? new Date(triggeredAt) : undefined;
  return {
    webhookId,
    eventId: request.headers.get("x-shopify-event-id") ?? undefined,
    apiVersion: request.headers.get("x-shopify-api-version") ?? undefined,
    triggeredAt:
      parsedTriggeredAt && !Number.isNaN(parsedTriggeredAt.valueOf())
        ? parsedTriggeredAt
        : undefined,
  };
}

export function targetFromWebhook(
  topic: string,
  payload: unknown,
): WebhookTarget {
  const record =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const gid =
    typeof record.admin_graphql_api_id === "string"
      ? record.admin_graphql_api_id
      : undefined;

  if (
    topic.startsWith("orders/") ||
    topic === "refunds/create" ||
    topic === "order_transactions/create"
  ) {
    return { resourceType: "ORDER", resourceGid: gid };
  }
  if (topic.startsWith("companies/"))
    return { resourceType: "COMPANY", resourceGid: gid };
  if (topic.startsWith("company_locations/"))
    return { resourceType: "COMPANY_LOCATION", resourceGid: gid };
  if (topic.startsWith("company_contacts/"))
    return { resourceType: "COMPANY_CONTACT", resourceGid: gid };
  if (topic.startsWith("payment_terms/") || topic === "payment_schedules/due") {
    // Payment term webhooks do not consistently identify their order. A narrow
    // reconciliation is safer than attempting to infer payment truth from the body.
    return { resourceType: "ORDER", resourceGid: undefined };
  }
  throw new UnsupportedSyncWebhookError();
}

export async function acceptSyncWebhook(input: {
  shopDomain: string;
  topic: string;
  payload: unknown;
  headers: WebhookHeaders;
  correlationId: string;
}): Promise<{ workItemId: string; duplicate: boolean } | null> {
  const shopDomain = normalizeShopDomain(input.shopDomain);
  const target = targetFromWebhook(input.topic, input.payload);
  const payloadHash = createHash("sha256")
    .update(`${input.topic}:${target.resourceType}:${target.resourceGid ?? ""}`)
    .digest("hex");

  try {
    return await prisma.$transaction(async (transaction) => {
      const shop = await transaction.shop.findUnique({ where: { shopDomain } });
      if (!shop || shop.status !== "ACTIVE") return null;

      const existing = await transaction.webhookReceipt.findUnique({
        where: {
          provider_shopId_externalReceiptId: {
            provider: SHOPIFY_PROVIDER,
            shopId: shop.id,
            externalReceiptId: input.headers.webhookId,
          },
        },
        include: {
          syncWorkItems: { take: 1, orderBy: { createdAt: "desc" } },
        },
      });
      if (existing) {
        const workItem = existing.syncWorkItems[0];
        return workItem ? { workItemId: workItem.id, duplicate: true } : null;
      }

      const receipt = await transaction.webhookReceipt.create({
        data: {
          shopId: shop.id,
          provider: SHOPIFY_PROVIDER,
          externalReceiptId: input.headers.webhookId,
          eventId: input.headers.eventId,
          topic: input.topic,
          apiVersion: input.headers.apiVersion,
          sourceOccurredAt: input.headers.triggeredAt,
          payloadHash,
          correlationId: input.correlationId,
        },
      });
      const workItem = await transaction.syncWorkItem.create({
        data: {
          shopId: shop.id,
          receiptId: receipt.id,
          kind: "WEBHOOK_REFRESH" satisfies SyncWorkKind,
          resourceType: target.resourceType,
          resourceGid: target.resourceGid,
          correlationId: input.correlationId,
        },
      });
      await new AuditRepository(transaction, shop.id).append({
        actorType: "SHOPIFY",
        action: "sync.webhook_accepted",
        targetType: "webhook_receipt",
        targetId: receipt.id,
        safeAfter: { topic: input.topic, resourceType: target.resourceType },
        reason: "durable_receipt_and_outbox",
        correlationId: input.correlationId,
      });
      return { workItemId: workItem.id, duplicate: false };
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      select: { id: true, status: true },
    });
    if (!shop || shop.status !== "ACTIVE") return null;
    const receipt = await prisma.webhookReceipt.findUnique({
      where: {
        provider_shopId_externalReceiptId: {
          provider: SHOPIFY_PROVIDER,
          shopId: shop.id,
          externalReceiptId: input.headers.webhookId,
        },
      },
      include: {
        syncWorkItems: { take: 1, orderBy: { createdAt: "desc" } },
      },
    });
    const workItem = receipt?.syncWorkItems[0];
    if (!workItem) throw error;
    return { workItemId: workItem.id, duplicate: true };
  }
}

export type SyncWorkTransaction = Prisma.TransactionClient;
