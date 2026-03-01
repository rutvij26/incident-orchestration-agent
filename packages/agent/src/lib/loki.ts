import { getConfig } from "./config.js";
import { logger } from "./logger.js";
import type { LogEvent } from "./types.js";

type LokiStream = {
  stream: Record<string, string>;
  values: Array<[string, string]>;
};

/** Query the Loki logs. */
export async function queryLoki(
  query: string,
  lookbackMinutes: number,
  limit = 500,
): Promise<LogEvent[]> {
  const { LOKI_URL } = getConfig();
  const endNs = BigInt(Date.now()) * 1_000_000n;
  const startNs = endNs - BigInt(lookbackMinutes) * 60n * 1_000_000_000n;

  const params = new URLSearchParams({
    query,
    limit: String(limit),
    start: startNs.toString(),
    end: endNs.toString(),
  });

  let response: Response;
  try {
    response = await fetch(
      `${LOKI_URL}/loki/api/v1/query_range?${params.toString()}`,
    );
  } catch (error) {
    throw new Error(`Loki request failed: ${String(error)}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Loki query failed: ${response.status} ${body}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Loki response was not valid JSON");
  }

  const streams = extractStreams(payload);
  if (streams === null) {
    logger.warn("Loki response missing expected data.result structure", {
      payload: JSON.stringify(payload).slice(0, 200),
    });
    return [];
  }

  const events: LogEvent[] = [];
  for (const stream of streams) {
    if (!stream.values || !stream.stream) {
      continue;
    }
    for (const [timestamp, message] of stream.values) {
      events.push({
        timestamp,
        message,
        labels: stream.stream,
      });
    }
  }
  return events;
}

function extractStreams(payload: unknown): LokiStream[] | null {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("data" in payload) ||
    typeof (payload as Record<string, unknown>).data !== "object"
  ) {
    return null;
  }
  const data = (payload as Record<string, unknown>).data as Record<
    string,
    unknown
  >;
  if (!Array.isArray(data.result)) {
    return null;
  }
  return data.result as LokiStream[];
}
