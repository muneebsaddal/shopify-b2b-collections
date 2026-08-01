export const PLATFORM_PROBE_JOB = "platform.probe" as const;
export const SYNCHRONIZATION_WORK_JOB = "synchronization.work" as const;
export const RECONCILIATION_SWEEP_JOB =
  "synchronization.reconcile-all" as const;
export const REMINDER_PLAN_JOB = "reminders.plan-all" as const;
export const REMINDER_SEND_JOB = "reminders.send" as const;
export const PRIVACY_PROCESS_JOB = "privacy.process" as const;
export const RETENTION_SWEEP_JOB = "retention.purge" as const;

export type PlatformProbeJob = {
  shopId: string;
  correlationId: string;
  idempotencyKey: string;
};

export type SynchronizationWorkJob = {
  workItemId: string;
};

export type ReconciliationSweepJob = Record<string, never>;
export type ReminderPlanJob = Record<string, never>;
export type ReminderSendJob = {
  deliveryId: string;
  correlationId: string;
};
export type PrivacyProcessJob = {
  privacyRequestId: string;
  correlationId: string;
};
export type RetentionSweepJob = Record<string, never>;

export type SupportedJobName =
  | typeof PLATFORM_PROBE_JOB
  | typeof SYNCHRONIZATION_WORK_JOB
  | typeof RECONCILIATION_SWEEP_JOB
  | typeof REMINDER_PLAN_JOB
  | typeof REMINDER_SEND_JOB
  | typeof PRIVACY_PROCESS_JOB
  | typeof RETENTION_SWEEP_JOB;
