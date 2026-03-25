import { getConfig } from "./config.js";
import type { LogEvent } from "./types.js";
import { LokiSourceConnector } from "../connectors/source/loki.js";

/**
 * Query the Loki logs.
 *
 * This function is a thin wrapper kept for backward compatibility. The actual
 * HTTP fetch and response parsing live in LokiSourceConnector.
 */
export async function queryLoki(
  query: string,
  lookbackMinutes: number,
  limit = 500,
): Promise<LogEvent[]> {
  const { LOKI_URL } = getConfig();
  const end = new Date();
  const start = new Date(end.getTime() - lookbackMinutes * 60 * 1000);
  const connector = new LokiSourceConnector(LOKI_URL, query);
  return connector.fetchLogs({ start, end, limit });
}
