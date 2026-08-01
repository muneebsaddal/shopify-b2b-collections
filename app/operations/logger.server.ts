type LogLevel = "debug" | "info" | "warn" | "error";

export type SafeLogContext = {
  correlationId?: string;
  event: string;
  shopId?: string;
  jobId?: string;
  queue?: string;
  durationMs?: number;
  statusCode?: number;
  errorCode?: string;
};

function write(level: LogLevel, context: SafeLogContext): void {
  // Select every field explicitly. TypeScript's structural type checking does
  // not protect this runtime boundary from extra properties supplied by
  // JavaScript, casts, or provider objects.
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    release: process.env.RELEASE_VERSION || "development",
    event: context.event,
    ...(context.correlationId
      ? { correlationId: context.correlationId }
      : {}),
    ...(context.shopId ? { shopId: context.shopId } : {}),
    ...(context.jobId ? { jobId: context.jobId } : {}),
    ...(context.queue ? { queue: context.queue } : {}),
    ...(context.durationMs !== undefined
      ? { durationMs: context.durationMs }
      : {}),
    ...(context.statusCode !== undefined
      ? { statusCode: context.statusCode }
      : {}),
    ...(context.errorCode ? { errorCode: context.errorCode } : {}),
  });
  process.stdout.write(`${record}\n`);
}

export const logger = {
  debug: (context: SafeLogContext) => write("debug", context),
  info: (context: SafeLogContext) => write("info", context),
  warn: (context: SafeLogContext) => write("warn", context),
  error: (context: SafeLogContext) => write("error", context),
};
