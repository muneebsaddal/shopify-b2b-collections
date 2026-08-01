import prisma from "../db.server";
import { AuditRepository } from "../operations/audit-repository.server";
import {
  failActiveReconciliationCursors,
  reconcileFullProjection,
  refreshOrderProjection,
} from "./reconciliation.server";

export async function processSynchronizationWork(
  workItemId: string,
): Promise<void> {
  const claimed = await prisma.syncWorkItem.updateMany({
    where: {
      id: workItemId,
      state: "QUEUED",
      availableAt: { lte: new Date() },
    },
    data: { state: "PROCESSING", attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return;

  const workItem = await prisma.syncWorkItem.findUnique({
    include: { shop: true },
    where: { id: workItemId },
  });
  if (!workItem) return;
  if (workItem.shop.status !== "ACTIVE" || !workItem.shop.scopesComplete) {
    await completeWork({
      workItemId,
      shopId: workItem.shopId,
      receiptId: workItem.receiptId,
      state: "FAILED",
      errorCode: "shop_inactive_or_scopes_incomplete",
      correlationId: workItem.correlationId,
      updateShopStatus: true,
    });
    return;
  }

  const targetedOrderRefresh =
    workItem.kind === "WEBHOOK_REFRESH" &&
    workItem.resourceType === "ORDER" &&
    Boolean(workItem.resourceGid);

  try {
    if (targetedOrderRefresh) {
      await refreshOrderProjection({
        shopId: workItem.shopId,
        shopDomain: workItem.shop.shopDomain,
        timezone: workItem.shop.timezone,
        orderGid: workItem.resourceGid!,
        correlationId: workItem.correlationId,
      });
    } else {
      await reconcileFullProjection({
        shopId: workItem.shopId,
        shopDomain: workItem.shop.shopDomain,
        kind: workItem.kind,
        correlationId: workItem.correlationId,
      });
    }

    await completeWork({
      workItemId,
      shopId: workItem.shopId,
      receiptId: workItem.receiptId,
      state: "COMPLETED",
      correlationId: workItem.correlationId,
      updateShopStatus: targetedOrderRefresh,
    });
  } catch {
    const retryable = workItem.attempts < 6;
    await Promise.all([
      failActiveReconciliationCursors(
        workItem.shopId,
        "shopify_synchronization_failed",
      ),
      completeWork({
        workItemId,
        shopId: workItem.shopId,
        receiptId: workItem.receiptId,
        state: retryable ? "QUEUED" : "FAILED",
        errorCode: "shopify_synchronization_failed",
        correlationId: workItem.correlationId,
        updateShopStatus: !retryable,
      }),
    ]);
    throw new Error("Shopify synchronization failed");
  }
}

async function completeWork(input: {
  workItemId: string;
  shopId: string;
  receiptId: string | null;
  state: "QUEUED" | "COMPLETED" | "FAILED";
  errorCode?: string;
  correlationId: string;
  updateShopStatus: boolean;
}): Promise<void> {
  await prisma.$transaction(async (transaction) => {
    await transaction.syncWorkItem.update({
      where: { id: input.workItemId },
      data: {
        state: input.state,
        errorCode: input.errorCode ?? null,
        completedAt: input.state === "COMPLETED" ? new Date() : undefined,
      },
    });
    if (input.receiptId) {
      await transaction.webhookReceipt.update({
        where: { id: input.receiptId },
        data: {
          state:
            input.state === "COMPLETED"
              ? "PROCESSED"
              : input.state === "FAILED"
                ? "FAILED"
                : "QUEUED",
          processedAt: input.state === "COMPLETED" ? new Date() : undefined,
          errorCode: input.errorCode ?? null,
        },
      });
    }
    if (input.updateShopStatus) {
      const shop = await transaction.shop.findUnique({
        where: { id: input.shopId },
        select: { syncStatus: true },
      });
      await transaction.shop.update({
        where: { id: input.shopId },
        data: {
          syncStatus:
            input.state === "FAILED"
              ? "FAILED"
              : shop?.syncStatus === "NOT_STARTED"
                ? "PARTIAL"
                : undefined,
        },
      });
    }
    await new AuditRepository(transaction, input.shopId).append({
      actorType: "WORKER",
      action:
        input.state === "COMPLETED"
          ? "sync.work_completed"
          : input.state === "FAILED"
            ? "sync.work_failed"
            : "sync.work_retry_scheduled",
      targetType: "sync_work_item",
      targetId: input.workItemId,
      safeAfter: {
        state: input.state,
        errorCode: input.errorCode ?? null,
      },
      reason:
        input.state === "COMPLETED"
          ? "shopify_projection_updated"
          : input.state === "FAILED"
            ? "shopify_projection_failed_closed"
            : "bounded_retry_pending",
      correlationId: input.correlationId,
    });
  });
}
