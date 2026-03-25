// Re-export all types from @agentic/shared for backward compatibility.
// Existing imports of "../lib/types.js" resolve here unchanged.
export type {
  IncidentSeverity,
  LogEvent,
  Incident,
  IncidentSummary,
  WorkflowInput,
  WorkflowResult,
} from "@agentic/shared";
