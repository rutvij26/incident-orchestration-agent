import pg from "pg";
import { getConfig } from "../lib/config.js";
import type { Incident } from "../lib/types.js";

const { Pool } = pg;

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const { POSTGRES_URL } = getConfig();
    pool = new Pool({ connectionString: POSTGRES_URL });
  }
  return pool;
}

export async function initMemory(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    await client.query(`
      CREATE TABLE IF NOT EXISTS incident_memory (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        severity TEXT NOT NULL,
        first_seen TIMESTAMPTZ NOT NULL,
        last_seen TIMESTAMPTZ NOT NULL,
        event_count INTEGER NOT NULL,
        evidence JSONB NOT NULL,
        embedding VECTOR(1536)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS auto_fix_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        incident_id TEXT NOT NULL,
        issue_number INTEGER NOT NULL,
        outcome TEXT NOT NULL,
        reason TEXT,
        fixability_score NUMERIC(3,2),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_auto_fix_attempts_incident_issue
      ON auto_fix_attempts (incident_id, issue_number)
    `);

    // M7: Dashboard query performance indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_incident_memory_status_created
      ON incident_memory (status, created_at DESC, id DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_incident_memory_created
      ON incident_memory (created_at DESC, id DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_auto_fix_created
      ON auto_fix_attempts (created_at DESC, id DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_workflow_runs_started_at
      ON workflow_runs (started_at DESC)
    `);

    // M6: DB-backed config store
    await client.query(`
      CREATE TABLE IF NOT EXISTS agent_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        encrypted BOOLEAN NOT NULL DEFAULT FALSE,
        group_name TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // M6: Workflow run audit log
    await client.query(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMPTZ,
        status TEXT NOT NULL,
        logs_scanned INTEGER DEFAULT 0,
        incidents_found INTEGER DEFAULT 0,
        issues_opened INTEGER DEFAULT 0,
        fixes_attempted INTEGER DEFAULT 0,
        error_message TEXT
      )
    `);

    // M6: Scheduling configuration (singleton row)
    await client.query(`
      CREATE TABLE IF NOT EXISTS schedule_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        cron_expression TEXT NOT NULL DEFAULT '*/15 * * * *',
        temporal_schedule_id TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // M6: Enrich incident_memory with dashboard-facing columns
    await client.query(`
      ALTER TABLE incident_memory
        ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open',
        ADD COLUMN IF NOT EXISTS issue_url TEXT,
        ADD COLUMN IF NOT EXISTS pr_url TEXT,
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
        ADD COLUMN IF NOT EXISTS workflow_run_id UUID
    `);

    // M6: Enrich auto_fix_attempts with dashboard-facing columns
    await client.query(`
      ALTER TABLE auto_fix_attempts
        ADD COLUMN IF NOT EXISTS pr_url TEXT,
        ADD COLUMN IF NOT EXISTS tests_passed BOOLEAN,
        ADD COLUMN IF NOT EXISTS plan_summary TEXT,
        ADD COLUMN IF NOT EXISTS duration_ms INTEGER
    `);
  } finally {
    client.release();
  }
}

export async function saveIncidents(incidents: Incident[]): Promise<void> {
  if (incidents.length === 0) {
    return;
  }
  const client = await getPool().connect();
  try {
    for (const incident of incidents) {
      await client.query(
        `
        INSERT INTO incident_memory (
          id, title, severity, first_seen, last_seen, event_count, evidence
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          severity = EXCLUDED.severity,
          first_seen = EXCLUDED.first_seen,
          last_seen = EXCLUDED.last_seen,
          event_count = EXCLUDED.event_count,
          evidence = EXCLUDED.evidence
        `,
        [
          incident.id,
          incident.title,
          incident.severity,
          new Date(Number(incident.firstSeen) / 1_000_000),
          new Date(Number(incident.lastSeen) / 1_000_000),
          incident.count,
          JSON.stringify(incident.evidence),
        ]
      );
    }
  } finally {
    client.release();
  }
}

export type AutoFixOutcome = "skipped" | "failed" | "pr_created";

export async function recordAutoFixAttempt(params: {
  incidentId: string;
  issueNumber: number;
  outcome: AutoFixOutcome;
  reason?: string;
  fixabilityScore?: number;
}): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      `INSERT INTO auto_fix_attempts (incident_id, issue_number, outcome, reason, fixability_score)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        params.incidentId,
        params.issueNumber,
        params.outcome,
        params.reason ?? null,
        params.fixabilityScore ?? null,
      ]
    );
  } finally {
    client.release();
  }
}

export async function startWorkflowRun(): Promise<string> {
  const client = await getPool().connect();
  try {
    const result = await client.query<{ id: string }>(
      `INSERT INTO workflow_runs (status) VALUES ('running') RETURNING id`
    );
    return result.rows[0]!.id;
  } finally {
    client.release();
  }
}

export async function completeWorkflowRun(params: {
  runId: string;
  status: "completed" | "failed";
  logsScanned: number;
  incidentsFound: number;
  issuesOpened: number;
  fixesAttempted: number;
  errorMessage?: string;
}): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(
      `UPDATE workflow_runs
       SET completed_at = NOW(),
           status = $2,
           logs_scanned = $3,
           incidents_found = $4,
           issues_opened = $5,
           fixes_attempted = $6,
           error_message = $7
       WHERE id = $1`,
      [
        params.runId,
        params.status,
        params.logsScanned,
        params.incidentsFound,
        params.issuesOpened,
        params.fixesAttempted,
        params.errorMessage ?? null,
      ]
    );
  } finally {
    client.release();
  }
}

export async function getRecentAutoFixAttempts(params: {
  incidentId: string;
  issueNumber: number;
  limit?: number;
}): Promise<Array<{ outcome: string; reason: string | null; created_at: Date }>> {
  const client = await getPool().connect();
  const limit = params.limit ?? 10;
  try {
    const result = await client.query(
      `SELECT outcome, reason, created_at FROM auto_fix_attempts
       WHERE incident_id = $1 AND issue_number = $2
       ORDER BY created_at DESC LIMIT $3`,
      [params.incidentId, params.issueNumber, limit]
    );
    return result.rows.map((r) => ({
      outcome: r.outcome,
      reason: r.reason,
      created_at: r.created_at,
    }));
  } finally {
    client.release();
  }
}
