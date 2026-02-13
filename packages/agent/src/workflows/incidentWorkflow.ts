import { proxyActivities } from "@temporalio/workflow";
import type { WorkflowInput, WorkflowResult } from "../lib/types.js";

const {
  fetchRecentLogs,
  detectIncidents,
  persistIncidents,
  createIssueForIncident,
} = proxyActivities<{
  fetchRecentLogs(input: {
    lookbackMinutes: number;
    query: string;
  }): Promise<unknown>;
  detectIncidents(logs: unknown): Promise<
    Array<{ incident: { severity: string } }>
  >;
  persistIncidents(incidents: unknown): Promise<void>;
  createIssueForIncident(incident: unknown): Promise<{
    created: boolean;
  }>;
}>({
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

export async function incidentOrchestrationWorkflow(
  input: WorkflowInput
): Promise<WorkflowResult> {
  const logs = await fetchRecentLogs({
    lookbackMinutes: input.lookbackMinutes,
    query: input.query,
  });

  const detected = await detectIncidents(logs);
  const incidents = detected.map((item: any) => item.incident);
  await persistIncidents(incidents);

  let issuesCreated = 0;
  for (const incident of incidents) {
    if (
      input.autoEscalateFrom === "none" ||
      severityRank(incident.severity) <
        severityRank(input.autoEscalateFrom)
    ) {
      continue;
    }
    const result = await createIssueForIncident(incident);
    if (result?.created) {
      issuesCreated += 1;
    }
  }

  return { incidents, issuesCreated };
}

function severityRank(severity: string): number {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
    default:
      return 1;
  }
}
