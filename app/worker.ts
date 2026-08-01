import { startWorker } from "./worker.server";
import { logger } from "./operations/logger.server";

const shutdown = await startWorker();
let stopping = false;

async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ event: "worker.shutdown_requested", errorCode: signal });
  await shutdown();
}

process.once("SIGINT", () => void stop("SIGINT"));
process.once("SIGTERM", () => void stop("SIGTERM"));
