import { NativeConnection, Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import { startTelemetry, stopTelemetry } from "./observability/otel.js";
import * as activities from "./activities/incidentActivities.js";
import { logger } from "./lib/logger.js";
import { getConfig } from "./lib/config.js";
import "./lib/env.js";

const workflowsPath = fileURLToPath(new URL("./workflows", import.meta.url));

async function runWorker(): Promise<void> {
  const { TEMPORAL_ADDRESS } = getConfig();
  await startTelemetry();

  const connection = await NativeConnection.connect({
    address: TEMPORAL_ADDRESS,
  });

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
