import { NativeConnection, Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { startTelemetry, stopTelemetry } from "./observability/otel.js";
import * as activities from "./activities/incidentActivities.js";
import { logger } from "./lib/logger.js";
import { getConfig } from "./lib/config.js";
import { initConfigLoader, stopConfigLoader } from "./lib/configLoader.js";
import { withRetry } from "./lib/retry.js";
import { initMemory } from "./memory/postgres.js";
import { indexRepository } from "./rag/indexRepo.js";
import type { Config } from "./lib/config.js";
import "./lib/env.js";

const workflowsPath = fileURLToPath(new URL("./workflows", import.meta.url));
const RETRY_ATTEMPTS = 10;
const RETRY_DELAY_MS = 2000;

async function maybeIndexRepo(config: Config): Promise<void> {
  const hasRepo =
    config.REPO_URL ||
    (config.GITHUB_OWNER && config.GITHUB_REPO) ||
    config.RAG_REPO_PATH;
  if (!hasRepo) return;
  try {
    logger.info("Checking RAG index...");
    await indexRepository();
    logger.info("RAG index ready");
  } catch (err) {
    logger.warn("RAG indexing failed, continuing without index", {
      error: String(err),
    });
  }
}

async function runWorker(): Promise<void> {
  const config = getConfig();
  const { TEMPORAL_ADDRESS, POSTGRES_URL } = config;

  // Initialize DB schema (idempotent — creates tables and adds columns if needed)
  await initMemory();

  // Initialize config loader — starts DB polling if CONFIG_SOURCE=db
  const pool = new pg.Pool({ connectionString: POSTGRES_URL });
  await initConfigLoader(pool);

  // Index the repo on first boot (skips if already indexed with same HEAD SHA)
  await maybeIndexRepo(config);

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

  const shutdown = () => {
    logger.info("Shutdown signal received, draining worker...");
    stopConfigLoader();
    worker.shutdown();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

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
