export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export type LogEvent = {
  timestamp: string;
  message: string;
  labels: Record<string, string>;
};

export type Incident = {
  id: string;
  title: string;
  severity: IncidentSeverity;
  evidence: string[];
  firstSeen: string;
  lastSeen: string;
  count: number;
};

export type WorkflowInput = {
  lookbackMinutes: number;
  query: string;
  autoEscalateFrom: IncidentSeverity | "none";
};

export type WorkflowResult = {
  incidents: Incident[];
  issuesCreated: number;
};
