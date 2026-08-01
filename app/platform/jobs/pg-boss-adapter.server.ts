import PgBoss from "pg-boss";

import { logger } from "../../operations/logger.server";
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
} from "./contracts";

const DEAD_LETTER_QUEUE = "platform.dead-letter";

export class PgBossJobAdapter {
  private readonly boss: PgBoss;
  private started = false;

  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString)
      throw new Error("DATABASE_URL is required for background jobs");
    this.boss = new PgBoss({
      connectionString,
      schema: "pgboss",
      application_name: "b2b-ar-collections-assistant",
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      expireInHours: 1,
      retentionDays: 14,
      archiveFailedAfterSeconds: 60 * 60 * 24 * 30,
    });
    this.boss.on("error", () =>
      logger.error({ event: "jobs.queue_error", errorCode: "pg_boss_error" }),
    );
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.boss.start();
    await this.boss.createQueue(DEAD_LETTER_QUEUE);
    await this.boss.createQueue(PLATFORM_PROBE_JOB, {
      name: PLATFORM_PROBE_JOB,
      deadLetter: DEAD_LETTER_QUEUE,
    });
    await this.boss.createQueue(SYNCHRONIZATION_WORK_JOB, {
      name: SYNCHRONIZATION_WORK_JOB,
      deadLetter: DEAD_LETTER_QUEUE,
    });
    await this.boss.createQueue(RECONCILIATION_SWEEP_JOB, {
      name: RECONCILIATION_SWEEP_JOB,
      deadLetter: DEAD_LETTER_QUEUE,
    });
    await this.boss.createQueue(REMINDER_PLAN_JOB, {
      name: REMINDER_PLAN_JOB,
      deadLetter: DEAD_LETTER_QUEUE,
    });
    await this.boss.createQueue(REMINDER_SEND_JOB, {
      name: REMINDER_SEND_JOB,
      deadLetter: DEAD_LETTER_QUEUE,
    });
    await this.boss.createQueue(PRIVACY_PROCESS_JOB, {
      name: PRIVACY_PROCESS_JOB,
      deadLetter: DEAD_LETTER_QUEUE,
    });
    await this.boss.createQueue(RETENTION_SWEEP_JOB, {
      name: RETENTION_SWEEP_JOB,
      deadLetter: DEAD_LETTER_QUEUE,
    });
    this.started = true;
    logger.info({ event: "jobs.started" });
  }

  async enqueueSyncWork(data: SynchronizationWorkJob): Promise<string | null> {
    await this.start();
    return this.boss.send(SYNCHRONIZATION_WORK_JOB, data, {
      singletonKey: data.workItemId,
      retryLimit: 5,
      retryDelay: 30,
      retryBackoff: true,
      deadLetter: DEAD_LETTER_QUEUE,
    });
  }

  async enqueuePlatformProbe(data: PlatformProbeJob): Promise<string | null> {
    await this.start();
    return this.boss.send(PLATFORM_PROBE_JOB, data, {
      singletonKey: `${data.shopId}:${data.idempotencyKey}`,
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      deadLetter: DEAD_LETTER_QUEUE,
    });
  }

  async enqueueReminderSend(data: ReminderSendJob): Promise<string | null> {
    await this.start();
    return this.boss.send(REMINDER_SEND_JOB, data, {
      singletonKey: data.deliveryId,
      retryLimit: 3,
      retryDelay: 60,
      retryBackoff: true,
      deadLetter: DEAD_LETTER_QUEUE,
    });
  }

  async enqueuePrivacyProcess(data: PrivacyProcessJob): Promise<string | null> {
    await this.start();
    return this.boss.send(PRIVACY_PROCESS_JOB, data, {
      singletonKey: data.privacyRequestId,
      retryLimit: 5,
      retryDelay: 60,
      retryBackoff: true,
      deadLetter: DEAD_LETTER_QUEUE,
    });
  }

  async workSynchronizationWork(
    handler: (job: SynchronizationWorkJob, jobId: string) => Promise<void>,
  ): Promise<void> {
    await this.start();
    await this.boss.work<SynchronizationWorkJob>(
      SYNCHRONIZATION_WORK_JOB,
      { batchSize: 1 },
      async (jobs) => {
        await Promise.all(jobs.map((job) => handler(job.data, job.id)));
      },
    );
  }

  async workPlatformProbe(
    handler: (job: PlatformProbeJob, jobId: string) => Promise<void>,
  ): Promise<void> {
    await this.start();
    await this.boss.work<PlatformProbeJob>(
      PLATFORM_PROBE_JOB,
      { batchSize: 1 },
      async (jobs) => {
        await Promise.all(jobs.map((job) => handler(job.data, job.id)));
      },
    );
  }

  async workReconciliationSweep(
    handler: (job: ReconciliationSweepJob, jobId: string) => Promise<void>,
  ): Promise<void> {
    await this.start();
    await this.boss.schedule(
      RECONCILIATION_SWEEP_JOB,
      "15 * * * *",
      {},
      { tz: "UTC", retryLimit: 3, retryDelay: 60, retryBackoff: true },
    );
    await this.boss.work<ReconciliationSweepJob>(
      RECONCILIATION_SWEEP_JOB,
      { batchSize: 1 },
      async (jobs) => {
        await Promise.all(jobs.map((job) => handler(job.data, job.id)));
      },
    );
  }

  async workReminderPlan(
    handler: (job: ReminderPlanJob, jobId: string) => Promise<void>,
  ): Promise<void> {
    await this.start();
    await this.boss.schedule(
      REMINDER_PLAN_JOB,
      "10 * * * *",
      {},
      { tz: "UTC", retryLimit: 3, retryDelay: 60, retryBackoff: true },
    );
    await this.boss.work<ReminderPlanJob>(
      REMINDER_PLAN_JOB,
      { batchSize: 1 },
      async (jobs) => {
        await Promise.all(jobs.map((job) => handler(job.data, job.id)));
      },
    );
  }

  async workReminderSend(
    handler: (job: ReminderSendJob, jobId: string) => Promise<void>,
  ): Promise<void> {
    await this.start();
    await this.boss.work<ReminderSendJob>(
      REMINDER_SEND_JOB,
      { batchSize: 1 },
      async (jobs) => {
        await Promise.all(jobs.map((job) => handler(job.data, job.id)));
      },
    );
  }

  async workPrivacyProcess(
    handler: (job: PrivacyProcessJob, jobId: string) => Promise<void>,
  ): Promise<void> {
    await this.start();
    await this.boss.work<PrivacyProcessJob>(
      PRIVACY_PROCESS_JOB,
      { batchSize: 1 },
      async (jobs) => {
        await Promise.all(jobs.map((job) => handler(job.data, job.id)));
      },
    );
  }

  async workRetentionSweep(
    handler: (job: RetentionSweepJob, jobId: string) => Promise<void>,
  ): Promise<void> {
    await this.start();
    await this.boss.schedule(
      RETENTION_SWEEP_JOB,
      "35 * * * *",
      {},
      { tz: "UTC", retryLimit: 3, retryDelay: 60, retryBackoff: true },
    );
    await this.boss.work<RetentionSweepJob>(
      RETENTION_SWEEP_JOB,
      { batchSize: 1 },
      async (jobs) => {
        await Promise.all(jobs.map((job) => handler(job.data, job.id)));
      },
    );
  }

  async deadLetterCount(): Promise<number> {
    await this.start();
    return this.boss.getQueueSize(DEAD_LETTER_QUEUE);
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await this.boss.stop({ graceful: true, timeout: 30000, wait: true });
    this.started = false;
    logger.info({ event: "jobs.stopped" });
  }
}
