import type { LogEvent } from "../../lib/types.js";

export type { LogEvent };

/**
 * A SourceConnector knows how to fetch recent log events from one log backend
 * (e.g. Loki, Datadog, CloudWatch). Multiple instances are aggregated via
 * `aggregateLogs()` in the registry.
 *
 * Implemented in Milestone 5.
 */
export interface SourceConnector {
  fetchLogs(opts: { start: Date; end: Date; limit: number }): Promise<LogEvent[]>;
}
