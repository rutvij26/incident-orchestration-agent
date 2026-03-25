import type { IncidentSeverity } from "../types/incident.js";

export const SEVERITY_ORDER: Record<IncidentSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export const ALL_SEVERITIES: readonly IncidentSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
