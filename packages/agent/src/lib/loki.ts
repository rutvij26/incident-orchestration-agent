import { getConfig } from "./config.js";
import type { LogEvent } from "./types.js";

type LokiQueryResponse = {
  status: string;
  data: {
    resultType: string;
    result: Array<{
      stream: Record<string, string>;
      values: Array<[string, string]>;
    }>;
  };
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

  const response = await fetch(
    `${LOKI_URL}/loki/api/v1/query_range?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(`Loki query failed: ${response.status}`);
  }

  const payload = (await response.json()) as LokiQueryResponse;
  const events: LogEvent[] = [];
  for (const stream of payload.data.result) {
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
