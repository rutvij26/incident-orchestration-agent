import "./lib/env.js";
import pg from "pg";
import { Connection } from "@temporalio/client";
import { getConfig } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { withRetry } from "./lib/retry.js";

const TIMEOUT_MS = 3000;
const RETRY_ATTEMPTS = 10;
const RETRY_DELAY_MS = 2000;

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out`)), TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]);
}

async function checkLoki(url: string): Promise<void> {
  const response = await withTimeout(
    fetch(`${url}/ready`),
    "Loki readiness"
  );
  if (!response.ok) {
    throw new Error(`Loki unhealthy: ${response.status}`);
  }
}

async function checkPostgres(connectionString: string): Promise<void> {
  const pool = new pg.Pool({ connectionString, max: 1 });
  try {
    await withTimeout(pool.query("SELECT 1"), "Postgres query");
  } finally {
    await pool.end();
  }
}

async function checkTemporal(address: string): Promise<void> {
  const connection = await withTimeout(
    Connection.connect({ address }),
    "Temporal connect"
  );
  await connection.close();
}

async function checkDemo(url?: string): Promise<void> {
  if (!url) {
    return;
  }
  const response = await withTimeout(fetch(url), "Demo service health");
  if (!response.ok) {
    throw new Error(`Demo service unhealthy: ${response.status}`);
  }
}

async function run(): Promise<void> {
  const config = getConfig();
  const results: Array<{ name: string; ok: boolean; error?: string }> = [];

  const checks: Array<Promise<void>> = [
    withRetry(() => checkLoki(config.LOKI_URL), {
      attempts: RETRY_ATTEMPTS,
      delayMs: RETRY_DELAY_MS,
    }).then(
      () => {
        results.push({ name: "loki", ok: true });
      },
      (error) => {
        results.push({ name: "loki", ok: false, error: String(error) });
      }
    ),
    withRetry(() => checkPostgres(config.POSTGRES_URL), {
      attempts: RETRY_ATTEMPTS,
      delayMs: RETRY_DELAY_MS,
    }).then(
      () => {
        results.push({ name: "postgres", ok: true });
      },
      (error) => {
        results.push({ name: "postgres", ok: false, error: String(error) });
      }
    ),
    withRetry(() => checkTemporal(config.TEMPORAL_ADDRESS), {
      attempts: RETRY_ATTEMPTS,
      delayMs: RETRY_DELAY_MS,
    }).then(
      () => {
        results.push({ name: "temporal", ok: true });
      },
      (error) => {
        results.push({ name: "temporal", ok: false, error: String(error) });
      }
    ),
    withRetry(() => checkDemo(config.DEMO_HEALTH_URL), {
      attempts: RETRY_ATTEMPTS,
      delayMs: RETRY_DELAY_MS,
    }).then(
      () => {
        results.push({ name: "demo", ok: true });
      },
      (error) => {
        results.push({ name: "demo", ok: false, error: String(error) });
      }
    ),
  ];

  await Promise.all(checks);

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    logger.error("Healthcheck failed", { failed });
    process.exit(1);
  }

  logger.info("Healthcheck passed", { results });
}

run().catch((error) => {
  logger.error("Healthcheck crashed", { error: String(error) });
  process.exit(1);
});
