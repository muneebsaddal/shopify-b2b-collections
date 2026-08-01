import prisma from "./db.server";
import { logger } from "./operations/logger.server";
import { AuditRepository } from "./operations/audit-repository.server";
import {
  PLATFORM_PROBE_JOB,
  PRIVACY_PROCESS_JOB,
  RECONCILIATION_SWEEP_JOB,
  REMINDER_PLAN_JOB,
  REMINDER_SEND_JOB,
  RETENTION_SWEEP_JOB,
  SYNCHRONIZATION_WORK_JOB,
  type PlatformProbeJob,
  type PrivacyProcessJob,
  type ReconciliationSweepJob,
  type ReminderPlanJob,
  type ReminderSendJob,
  type RetentionSweepJob,
  type SynchronizationWorkJob,
} from "./platform/jobs/contracts";
import { PgBossJobAdapter } from "./platform/jobs/pg-boss-adapter.server";
import {
  InactiveShopError,
  ShopRepository,
} from "./tenancy/shop-repository.server";
import { createCorrelationId } from "./operations/correlation.server";
import { requestShopSynchronization } from "./sync/synchronization-request.server";
import { processSynchronizationWork } from "./sync/synchronization-worker.server";
import {
  planDueReminderDeliveries,
  processReminderDelivery,
} from "./reminders/delivery-service.server";
import { entitlementDecisionForShop } from "./billing/entitlement-service.server";
import { isOperationAllowed } from "./operations/safety-controls.server";
import { processPrivacyRequest } from "./privacy/privacy-service.server";
import { runRetentionSweep } from "./privacy/retention-service.server";

export async function startWorker(
  adapter = new PgBossJobAdapter(),
): Promise<() => Promise<void>> {
  await adapter.workPlatformProbe(async (job, jobId) =>
    processPlatformProbe(job, jobId),
  );
  await adapter.workSynchronizationWork(async (job, jobId) =>
    processSynchronizationJob(job, jobId),
  );
  await adapter.workReconciliationSweep(async (job, jobId) =>
    processReconciliationSweep(job, jobId),
  );
  await adapter.workReminderPlan(async (job, jobId) =>
    processReminderPlan(job, jobId, adapter),
  );
  await adapter.workReminderSend(async (job, jobId) =>
    processReminderSend(job, jobId),
  );
  await adapter.workPrivacyProcess(async (job, jobId) =>
    processPrivacyJob(job, jobId),
  );
  await adapter.workRetentionSweep(async (job, jobId) =>
    processRetentionJob(job, jobId),
  );
  logger.info({
    event: "worker.ready",
    queue: `${PLATFORM_PROBE_JOB},${SYNCHRONIZATION_WORK_JOB},${RECONCILIATION_SWEEP_JOB},${REMINDER_PLAN_JOB},${REMINDER_SEND_JOB},${PRIVACY_PROCESS_JOB},${RETENTION_SWEEP_JOB}`,
  });
  return async () => {
    await adapter.stop();
    await prisma.$disconnect();
  };
}

async function processReminderPlan(
  _job: ReminderPlanJob,
  jobId: string,
  adapter: PgBossJobAdapter,
): Promise<void> {
  const shops = await prisma.shop.findMany({
    where: {
      status: "ACTIVE",
      scopesComplete: true,
      syncStatus: "FRESH",
      globalRemindersPaused: false,
    },
    select: { id: true },
  });
  for (const shop of shops) {
    const [operationAllowed, entitlement] = await Promise.all([
      isOperationAllowed(shop.id, "REMINDER_SENDS"),
      entitlementDecisionForShop(shop.id, "RUN_REMINDER_AUTOMATION"),
    ]);
    if (!operationAllowed || !entitlement.allowed) continue;
    const createdDeliveryIds = await planDueReminderDeliveries(shop.id);
    const resumableDeliveries = await prisma.reminderDelivery.findMany({
      where: {
        shopId: shop.id,
        state: { in: ["RESERVED", "FAILED"] },
        scheduledAt: { lte: new Date() },
        attemptCount: { lt: 3 },
      },
      select: { id: true },
      take: 500,
    });
    const deliveryIds = [
      ...new Set([
        ...createdDeliveryIds,
        ...resumableDeliveries.map((delivery) => delivery.id),
      ]),
    ];
    await Promise.all(
      deliveryIds.map((deliveryId) =>
        adapter.enqueueReminderSend({
          deliveryId,
          correlationId: createCorrelationId(),
        }),
      ),
    );
  }
  logger.info({
    event: "worker.job_completed",
    queue: REMINDER_PLAN_JOB,
    jobId,
  });
}

async function processReminderSend(
  job: ReminderSendJob,
  jobId: string,
): Promise<void> {
  const delivery = await prisma.reminderDelivery.findUnique({
    where: { id: job.deliveryId },
    select: { shopId: true },
  });
  if (!delivery) return;
  const [operationAllowed, entitlement] = await Promise.all([
    isOperationAllowed(delivery.shopId, "REMINDER_SENDS"),
    entitlementDecisionForShop(
      delivery.shopId,
      "RUN_REMINDER_AUTOMATION",
    ),
  ]);
  if (!operationAllowed || !entitlement.allowed) return;
  await processReminderDelivery(job);
  logger.info({
    event: "worker.job_completed",
    queue: REMINDER_SEND_JOB,
    jobId,
  });
}

async function processReconciliationSweep(
  _job: ReconciliationSweepJob,
  jobId: string,
): Promise<void> {
  const shops = await prisma.shop.findMany({
    where: { status: "ACTIVE", scopesComplete: true },
    select: { id: true, shopDomain: true },
  });
  await Promise.all(
    shops.map(async (shop) => {
      try {
        if (!(await isOperationAllowed(shop.id, "SHOPIFY_IMPORTS"))) return;
        await requestShopSynchronization({
          shopDomain: shop.shopDomain,
          correlationId: createCorrelationId(),
        });
      } catch {
        logger.error({
          event: "worker.reconciliation_request_failed",
          queue: RECONCILIATION_SWEEP_JOB,
          jobId,
          shopId: shop.id,
          errorCode: "reconciliation_request_failed",
        });
      }
    }),
  );
  logger.info({
    event: "worker.job_completed",
    queue: RECONCILIATION_SWEEP_JOB,
    jobId,
  });
}

async function processSynchronizationJob(
  job: SynchronizationWorkJob,
  jobId: string,
): Promise<void> {
  try {
    const work = await prisma.syncWorkItem.findUnique({
      where: { id: job.workItemId },
      select: { shopId: true },
    });
    if (!work) return;
    if (!(await isOperationAllowed(work.shopId, "SHOPIFY_IMPORTS"))) {
      await prisma.syncWorkItem.updateMany({
        where: { id: job.workItemId, state: { in: ["QUEUED", "PROCESSING"] } },
        data: { state: "FAILED", errorCode: "shopify_imports_safety_blocked" },
      });
      return;
    }
    await processSynchronizationWork(job.workItemId);
    logger.info({
      event: "worker.job_completed",
      queue: SYNCHRONIZATION_WORK_JOB,
      jobId,
    });
  } catch {
    logger.error({
      event: "worker.job_failed",
      queue: SYNCHRONIZATION_WORK_JOB,
      jobId,
      errorCode: "synchronization_failed",
    });
    throw new Error("Synchronization work failed");
  }
}

async function processPrivacyJob(
  job: PrivacyProcessJob,
  jobId: string,
): Promise<void> {
  await processPrivacyRequest(job.privacyRequestId, job.correlationId);
  logger.info({
    event: "worker.job_completed",
    queue: PRIVACY_PROCESS_JOB,
    jobId,
    correlationId: job.correlationId,
  });
}

async function processRetentionJob(
  _job: RetentionSweepJob,
  jobId: string,
): Promise<void> {
  await runRetentionSweep();
  logger.info({
    event: "worker.job_completed",
    queue: RETENTION_SWEEP_JOB,
    jobId,
  });
}

async function processPlatformProbe(
  job: PlatformProbeJob,
  jobId: string,
): Promise<void> {
  try {
    const shop = await new ShopRepository(prisma).requireActiveById(job.shopId);
    await new AuditRepository(prisma, shop.id).append({
      actorType: "WORKER",
      action: "platform.probe_processed",
      targetType: "shop",
      targetId: shop.id,
      safeAfter: { idempotencyKey: job.idempotencyKey },
      reason: "d1_durable_job_probe",
      correlationId: job.correlationId,
    });
    logger.info({
      event: "worker.job_completed",
      queue: PLATFORM_PROBE_JOB,
      jobId,
      shopId: shop.id,
      correlationId: job.correlationId,
    });
  } catch (error) {
    if (error instanceof InactiveShopError) {
      logger.info({
        event: "worker.job_ignored_inactive_shop",
        queue: PLATFORM_PROBE_JOB,
        jobId,
        shopId: job.shopId,
        correlationId: job.correlationId,
      });
      return;
    }
    logger.error({
      event: "worker.job_failed",
      queue: PLATFORM_PROBE_JOB,
      jobId,
      shopId: job.shopId,
      correlationId: job.correlationId,
      errorCode: "platform_probe_failed",
    });
    throw error;
  }
}
