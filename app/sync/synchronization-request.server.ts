import {
  Prisma,
  type ShopSyncStatus,
  type SyncWorkKind,
} from "@prisma/client";

import prisma from "../db.server";
import { AuditRepository } from "../operations/audit-repository.server";
import { PgBossJobAdapter } from "../platform/jobs/pg-boss-adapter.server";
import { ShopRepository } from "../tenancy/shop-repository.server";

export class SynchronizationRequestError extends Error {}

function kindForStatus(status: ShopSyncStatus): Extract<
  SyncWorkKind,
  "INITIAL" | "RECONCILIATION" | "MANUAL_RETRY"
> {
  if (status === "NOT_STARTED") return "INITIAL";
  if (status === "FAILED") return "MANUAL_RETRY";
  return "RECONCILIATION";
}

export async function requestShopSynchronization(input: {
  shopDomain: string;
  correlationId: string;
  actorId?: string;
  requestedByMerchant?: boolean;
}): Promise<{ workItemId: string; duplicate: boolean }> {
  const shop = await new ShopRepository(prisma).findByDomain(input.shopDomain);
  if (!shop || shop.status !== "ACTIVE") {
    throw new SynchronizationRequestError("Shop is not active");
  }
  if (!shop.scopesComplete) {
    throw new SynchronizationRequestError(
      "Required Shopify scopes are incomplete",
    );
  }

  let requested;
  try {
    requested = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.syncWorkItem.findFirst({
        where: {
          shopId: shop.id,
          resourceType: "FULL_SYNC",
          state: { in: ["QUEUED", "PROCESSING"] },
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) return { workItem: existing, duplicate: true };

      const kind = kindForStatus(shop.syncStatus);
      const workItem = await transaction.syncWorkItem.create({
        data: {
          shopId: shop.id,
          kind,
          resourceType: "FULL_SYNC",
          correlationId: input.correlationId,
        },
      });
      await transaction.shop.update({
        where: { id: shop.id },
        data: {
          syncStatus: kind === "RECONCILIATION" ? "RECONCILING" : "SYNCING",
        },
      });
      await new AuditRepository(transaction, shop.id).append({
        actorType: input.requestedByMerchant ? "MERCHANT" : "SYSTEM",
        actorId: input.actorId,
        action: "sync.requested",
        targetType: "sync_work_item",
        targetId: workItem.id,
        safeAfter: { kind, resourceType: "FULL_SYNC" },
        reason: input.requestedByMerchant
          ? "merchant_sync_request"
          : "installation_bootstrap",
        correlationId: input.correlationId,
      });
      return { workItem, duplicate: false };
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
    const existing = await prisma.syncWorkItem.findFirst({
      where: {
        shopId: shop.id,
        resourceType: "FULL_SYNC",
        state: { in: ["QUEUED", "PROCESSING"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!existing) throw error;
    requested = { workItem: existing, duplicate: true };
  }

  try {
    await new PgBossJobAdapter().enqueueSyncWork({
      workItemId: requested.workItem.id,
    });
  } catch {
    await prisma.$transaction(async (transaction) => {
      await transaction.syncWorkItem.updateMany({
        where: {
          id: requested.workItem.id,
          state: "QUEUED",
        },
        data: {
          state: "FAILED",
          errorCode: "queue_submission_failed",
        },
      });
      await transaction.shop.update({
        where: { id: shop.id },
        data: { syncStatus: "FAILED" },
      });
      await new AuditRepository(transaction, shop.id).append({
        actorType: "SYSTEM",
        action: "sync.queue_submission_failed",
        targetType: "sync_work_item",
        targetId: requested.workItem.id,
        safeAfter: { state: "FAILED", errorCode: "queue_submission_failed" },
        reason: "durable_work_item_not_submitted",
        correlationId: input.correlationId,
      });
    });
    throw new SynchronizationRequestError(
      "Synchronization could not be queued",
    );
  }

  return {
    workItemId: requested.workItem.id,
    duplicate: requested.duplicate,
  };
}
