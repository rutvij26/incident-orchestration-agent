import type pg from "pg";
import { ConfigSchema } from "./configSchema.js";
import type { Config } from "./configSchema.js";
import { decrypt } from "./crypto.js";
import { CONFIG_POLL_INTERVAL_MS } from "@agentic/shared";

/** Bootstrap env vars that always come from process.env, never overridden by DB. */
const BOOTSTRAP_KEYS = new Set([
  "POSTGRES_URL",
  "TEMPORAL_ADDRESS",
  "ENCRYPTION_KEY",
  "CONFIG_SOURCE",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
]);

let loaderActive = false;
let cachedConfig: Config | null = null;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let isPolling = false;
let dbPool: pg.Pool | null = null;

/** Returns true if the DB-backed loader has been initialized. */
export function isLoaderActive(): boolean {
  return loaderActive;
}

/** Returns the current config from the in-memory cache (DB mode). */
export function getConfigFromLoader(): Config {
  if (!cachedConfig) {
    throw new Error(
      "Config loader is active but cache is empty — initConfigLoader() may not have completed"
    );
  }
  return cachedConfig;
}

/**
 * Initialize the config loader.
 * - CONFIG_SOURCE=env (default): no-op, falls back to env-var parsing.
 * - CONFIG_SOURCE=db: performs an initial poll immediately, then polls every 30s.
 */
export async function initConfigLoader(pool: pg.Pool): Promise<void> {
  const configSource = process.env["CONFIG_SOURCE"] ?? "env";
  if (configSource !== "db") {
    return;
  }

  dbPool = pool;
  loaderActive = true;

  // Initial synchronous poll before marking loader active for callers
  await pollConfig();

  // Start periodic polling
  intervalHandle = setInterval(() => {
    void poll();
  }, CONFIG_POLL_INTERVAL_MS);
}

/** Stop the config loader and clear the polling interval. */
export function stopConfigLoader(): void {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  loaderActive = false;
  cachedConfig = null;
  dbPool = null;
  isPolling = false;
}

async function poll(): Promise<void> {
  if (isPolling) return;
  isPolling = true;
  try {
    await pollConfig();
  } catch (err) {
    // Log and keep the previous cached config — never crash the worker
    console.error("[configLoader] Poll failed, keeping previous config:", err);
  } finally {
    isPolling = false;
  }
}

async function pollConfig(): Promise<void> {
  if (!dbPool) return;

  const encryptionKey = process.env["ENCRYPTION_KEY"];

  const result = await dbPool.query<{
    key: string;
    value: string;
    encrypted: boolean;
  }>("SELECT key, value, encrypted FROM agent_config");

  const dbValues: Record<string, string> = {};

  for (const row of result.rows) {
    // Skip bootstrap keys — they always come from process.env
    if (BOOTSTRAP_KEYS.has(row.key)) continue;

    if (row.encrypted) {
      if (!encryptionKey) {
        throw new Error(
          "ENCRYPTION_KEY is required when CONFIG_SOURCE=db and encrypted config values exist. " +
            "Set a 32-byte hex key in ENCRYPTION_KEY environment variable."
        );
      }
      dbValues[row.key] = decrypt(row.value, encryptionKey);
    } else {
      dbValues[row.key] = row.value;
    }
  }

  // Bootstrap vars always come from process.env and override any DB values
  const merged: Record<string, string> = {
    ...dbValues,
    ...Object.fromEntries(
      Array.from(BOOTSTRAP_KEYS)
        .filter((k) => process.env[k] !== undefined)
        .map((k) => [k, process.env[k] as string])
    ),
  };

  cachedConfig = ConfigSchema.parse(merged);
}
