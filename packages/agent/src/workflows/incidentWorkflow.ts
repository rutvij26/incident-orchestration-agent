import { proxyActivities } from "@temporalio/workflow";
import type { WorkflowInput, WorkflowResult } from "../lib/types.js";
import { severityRank } from "../lib/severity.js";

const {
  fetchRecentLogs,
  detectIncidents,
  persistIncidents,
  summarizeIncident,
  refreshRepoCache,
  createIssueForIncident,
  recordWorkflowStart,
  recordWorkflowComplete,
} = proxyActivities<{
  fetchRecentLogs(input: {
    lookbackMinutes: number;
    query: string;
  }): Promise<unknown[]>;
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
  recordWorkflowStart(): Promise<string>;
  recordWorkflowComplete(params: {
    runId: string;
    status: "completed" | "failed";
    logsScanned: number;
    incidentsFound: number;
    issuesOpened: number;
    fixesAttempted: number;
    errorMessage?: string;
  }): Promise<void>;
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
  const runId = await recordWorkflowStart();

  let logsScanned = 0;
  let issuesCreated = 0;
  let fixesAttempted = 0;

  try {
    await refreshRepoCache();

    const logs = await fetchRecentLogs({
      lookbackMinutes: input.lookbackMinutes,
      query: input.query,
    });
    logsScanned = logs.length;

    const detected = await detectIncidents(logs);
    const incidents = detected.map((item: any) => item.incident);

    await persistIncidents(incidents);

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
          fixesAttempted += 1;
          await autoFixIncident({
            incident,
            summary,
            issueNumber: result.number,
            issueUrl: result.url,
          });
        }
      }
    }

    await recordWorkflowComplete({
      runId,
      status: "completed",
      logsScanned,
      incidentsFound: incidents.length,
      issuesOpened: issuesCreated,
      fixesAttempted,
    });

    return { incidents, issuesCreated };
  } catch (err) {
    await recordWorkflowComplete({
      runId,
      status: "failed",
      logsScanned,
      incidentsFound: 0,
      issuesOpened: issuesCreated,
      fixesAttempted,
      errorMessage: String(err),
    });
    throw err;
  }
}
