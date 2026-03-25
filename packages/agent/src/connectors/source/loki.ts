import { logger } from "../../lib/logger.js";
import type { SourceConnector, LogEvent } from "./interface.js";

type LokiStream = {
  stream: Record<string, string>;
  values: Array<[string, string]>;
};

/**
 * Source connector for Grafana Loki.
 *
 * Configuration is baked into the constructor so the connector is self-contained
 * and the registry can create multiple instances for different Loki deployments.
 */
export class LokiSourceConnector implements SourceConnector {
  constructor(
    private readonly url: string,
    private readonly query: string,
  ) {}

  async fetchLogs(opts: {
    start: Date;
    end: Date;
    limit: number;
  }): Promise<LogEvent[]> {
    const startNs = BigInt(opts.start.getTime()) * 1_000_000n;
    const endNs = BigInt(opts.end.getTime()) * 1_000_000n;

    const params = new URLSearchParams({
      query: this.query,
      limit: String(opts.limit),
      start: startNs.toString(),
      end: endNs.toString(),
    });

    let response: Response;
    try {
      response = await fetch(
        `${this.url}/loki/api/v1/query_range?${params.toString()}`,
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

    const streams = this.extractStreams(payload);
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
        events.push({ timestamp, message, labels: stream.stream });
      }
    }
    return events;
  }

  private extractStreams(payload: unknown): LokiStream[] | null {
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("data" in payload) ||
      typeof (payload as Record<string, unknown>).data !== "object" ||
      (payload as Record<string, unknown>).data === null
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
}
