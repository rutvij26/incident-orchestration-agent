import { proxyActivities } from "@temporalio/workflow";
import type { WorkflowInput, WorkflowResult } from "../lib/types.js";

const {
  fetchRecentLogs,
  detectIncidents,
  persistIncidents,
  summarizeIncident,
  refreshRepoCache,
  createIssueForIncident,
} = proxyActivities<{
  fetchRecentLogs(input: {
    lookbackMinutes: number;
    query: string;
  }): Promise<unknown>;
  detectIncidents(
    logs: unknown,
  ): Promise<Array<{ incident: { severity: string } }>>;
  persistIncidents(incidents: unknown): Promise<void>;
  summarizeIncident(incident: unknown): Promise<unknown>;
  refreshRepoCache(): Promise<{ ok: boolean }>;
  createIssueForIncident(
    incident: unknown,
    summary: unknown,
  ): Promise<{
    created: boolean;
    url?: string;
    number?: number;
  }>;
}>({
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 3,
  },
});

const { autoFixIncident } = proxyActivities<{
  autoFixIncident(input: {
    incident: unknown;
    summary: unknown;
    issueNumber: number;
    issueUrl?: string;
  }): Promise<{ status: string }>;
}>({
  startToCloseTimeout: "15 minutes",
  retry: {
    maximumAttempts: 1,
  },
});

/**
 * The incident orchestration workflow.
 * @param input - @type {WorkflowInput}
 * @returns @type {WorkflowResult}
 */
export async function incidentOrchestrationWorkflow(
  input: WorkflowInput,
): Promise<WorkflowResult> {
  /**
   * Refresh the repository cache.
   */
  await refreshRepoCache();

  /**
   * Fetch the recent logs.
   */
  const logs = await fetchRecentLogs({
    lookbackMinutes: input.lookbackMinutes,
    query: input.query,
  });

  /**
   * Detect the incidents.
   */
  const detected = await detectIncidents(logs);
  const incidents = detected.map((item: any) => item.incident);

  /**
   * Persist the incidents.
   */
  await persistIncidents(incidents);

  /**
   * Create issues for the incidents.
   */
  let issuesCreated = 0;
  for (const incident of incidents) {
    if (
      input.autoEscalateFrom === "none" ||
      severityRank(incident.severity) < severityRank(input.autoEscalateFrom)
    ) {
      continue;
    }
    const summary = await summarizeIncident(incident);
    const result = await createIssueForIncident(incident, summary);
    if (result?.created) {
      issuesCreated += 1;
      if (result.number) {
        await autoFixIncident({
          incident,
          summary,
          issueNumber: result.number,
          issueUrl: result.url,
        });
      }
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
