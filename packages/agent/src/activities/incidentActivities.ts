import { randomUUID } from "node:crypto";
import { queryLoki } from "../lib/loki.js";
import type { Incident, LogEvent } from "../lib/types.js";
import { createIssue } from "../lib/github.js";
import { initMemory, saveIncidents } from "../memory/postgres.js";

type FetchLogsInput = {
  lookbackMinutes: number;
  query: string;
};

export async function fetchRecentLogs(
  input: FetchLogsInput
): Promise<LogEvent[]> {
  return queryLoki(input.query, input.lookbackMinutes);
}

type DetectedIncident = {
  incident: Incident;
  tags: string[];
};

function extractSignal(log: LogEvent): {
  key: string;
  severity: Incident["severity"];
  label: string;
} {
  let message = log.message;
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(log.message);
    if (typeof parsed.msg === "string") {
      message = parsed.msg;
    }
  } catch {
    parsed = null;
  }

  const type = typeof parsed?.type === "string" ? parsed.type : "";
  const route = typeof parsed?.route === "string" ? parsed.route : "unknown";

  if (type === "error_burst" || message.includes("Synthetic error burst")) {
    return {
      key: `error_burst:${route}`,
      severity: "high",
      label: "error_burst",
    };
  }
  if (message.includes("Simulated error")) {
    return { key: `error:${route}`, severity: "high", label: "error" };
  }
  if (message.includes("Slow response")) {
    return { key: `slow:${route}`, severity: "medium", label: "latency" };
  }
  if (message.includes("Failed login attempt")) {
    return { key: `auth:${route}`, severity: "low", label: "auth" };
  }

  return { key: `other:${route}`, severity: "low", label: "unknown" };
}

export async function detectIncidents(
  logs: LogEvent[]
): Promise<DetectedIncident[]> {
  const buckets = new Map<
    string,
    {
      severity: Incident["severity"];
      label: string;
      messages: string[];
      timestamps: string[];
    }
  >();

  for (const log of logs) {
    const signal = extractSignal(log);
    const bucket = buckets.get(signal.key) ?? {
      severity: signal.severity,
      label: signal.label,
      messages: [],
      timestamps: [],
    };
    bucket.messages.push(log.message);
    bucket.timestamps.push(log.timestamp);
    buckets.set(signal.key, bucket);
  }

  const incidents: DetectedIncident[] = [];
  for (const [key, bucket] of buckets) {
    const sortedTimes = bucket.timestamps.sort();
    const firstSeen = sortedTimes[0];
    const lastSeen = sortedTimes[sortedTimes.length - 1];
    const incident: Incident = {
      id: randomUUID(),
      title: `Incident: ${bucket.label} (${key})`,
      severity: bucket.severity,
      evidence: bucket.messages.slice(0, 5),
      firstSeen,
      lastSeen,
      count: bucket.messages.length,
    };
    incidents.push({ incident, tags: [bucket.label] });
  }

  return incidents;
}

export async function persistIncidents(incidents: Incident[]): Promise<void> {
  await initMemory();
  await saveIncidents(incidents);
}

export async function createIssueForIncident(
  incident: Incident
): Promise<{ created: boolean; url?: string; reason?: string }> {
  const body = [
    `Severity: **${incident.severity}**`,
    `Count: **${incident.count}**`,
    `First seen: ${incident.firstSeen}`,
    `Last seen: ${incident.lastSeen}`,
    "",
    "Evidence:",
    ...incident.evidence.map((line) => `- ${line}`),
  ].join("\n");

  return createIssue({
    title: incident.title,
    body,
    labels: ["incident", incident.severity],
  });
}
