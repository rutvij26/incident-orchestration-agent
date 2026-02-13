import { NativeConnection, Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import { startTelemetry, stopTelemetry } from "./observability/otel.js";
import * as activities from "./activities/incidentActivities.js";
import { logger } from "./lib/logger.js";
import { getConfig } from "./lib/config.js";
import { withRetry } from "./lib/retry.js";
import "./lib/env.js";

const workflowsPath = fileURLToPath(new URL("./workflows", import.meta.url));
const RETRY_ATTEMPTS = 10;
const RETRY_DELAY_MS = 2000;

async function runWorker(): Promise<void> {
  const { TEMPORAL_ADDRESS } = getConfig();
  await startTelemetry();

  let attempt = 0;
  const connection = await withRetry(
    async () => {
      attempt += 1;
      logger.info("Connecting to Temporal", {
        temporalAddress: TEMPORAL_ADDRESS,
        attempt,
        maxAttempts: RETRY_ATTEMPTS,
      });
      return NativeConnection.connect({
        address: TEMPORAL_ADDRESS,
      });
    },
    { attempts: RETRY_ATTEMPTS, delayMs: RETRY_DELAY_MS }
  );
  logger.info("Connected to Temporal", { temporalAddress: TEMPORAL_ADDRESS });

  const worker = await Worker.create({
    connection,
    workflowsPath,
    activities,
    taskQueue: "incident-orchestration",
    namespace: "default",
  });

  logger.info("Temporal worker started", { taskQueue: "incident-orchestration" });
  await worker.run();
}

runWorker()
  .catch((error) => {
    const payload =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error;
    logger.error("Worker failed", { error: payload });
    process.exit(1);
  })
  .finally(async () => {
    await stopTelemetry();
  });
