import { pool } from "@/lib/db";

export interface OverviewStats {
  totalIncidents: number;
  openIssues: number;
  fixesAttempted: number;
  lastScan: string | null;
  lastScanStatus: string | null;
}

export interface OverviewIncident {
  id: string;
  title: string;
  severity: string;
  status: string | null;
  issue_url: string | null;
  created_at: string | null;
  last_seen: string | null;
}

export interface OverviewPR {
  id: string;
  incident_id: string;
  pr_url: string;
  outcome: string;
  tests_passed: boolean | null;
  plan_summary: string | null;
  created_at: string | null;
}

export interface OverviewWorkflowRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  logs_scanned: number;
  incidents_found: number;
  issues_opened: number;
  fixes_attempted: number;
  error_message: string | null;
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const result = await pool.query<{
    total_incidents: string;
    open_issues: string;
    fixes_attempted: string;
    last_scan: string | null;
    last_scan_status: string | null;
  }>(`
    WITH
      counts AS (
        SELECT
          COUNT(*) AS total_incidents,
          COUNT(*) FILTER (WHERE status = 'open' OR status IS NULL) AS open_issues
        FROM incident_memory
      ),
      fix_count AS (
        SELECT COUNT(*) AS fixes_attempted FROM auto_fix_attempts
      ),
      last_run AS (
        SELECT started_at, status FROM workflow_runs ORDER BY started_at DESC LIMIT 1
      )
    SELECT
      counts.total_incidents::text,
      counts.open_issues::text,
      fix_count.fixes_attempted::text,
      last_run.started_at AS last_scan,
      last_run.status AS last_scan_status
    FROM counts, fix_count
    LEFT JOIN last_run ON true
  `);
  const row = result.rows[0];
  return {
    totalIncidents: parseInt(row?.total_incidents ?? "0", 10),
    openIssues: parseInt(row?.open_issues ?? "0", 10),
    fixesAttempted: parseInt(row?.fixes_attempted ?? "0", 10),
    lastScan: row?.last_scan ?? null,
    lastScanStatus: row?.last_scan_status ?? null,
  };
}

export async function getRecentIncidents(): Promise<OverviewIncident[]> {
  const result = await pool.query<OverviewIncident>(`
    SELECT id, title, severity, status, issue_url, created_at, last_seen
    FROM incident_memory
    ORDER BY COALESCE(created_at, last_seen) DESC
    LIMIT 10
  `);
  return result.rows;
}

export async function getRecentPRs(): Promise<OverviewPR[]> {
  const result = await pool.query<OverviewPR>(`
    SELECT id, incident_id, pr_url, outcome, tests_passed, plan_summary, created_at
    FROM auto_fix_attempts
    WHERE pr_url IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 5
  `);
  return result.rows;
}

export async function getLatestWorkflowRun(): Promise<OverviewWorkflowRun | null> {
  const result = await pool.query<OverviewWorkflowRun>(`
    SELECT id, started_at, completed_at, status, logs_scanned,
           incidents_found, issues_opened, fixes_attempted, error_message
    FROM workflow_runs
    ORDER BY started_at DESC
    LIMIT 1
  `);
  return result.rows[0] ?? null;
}
