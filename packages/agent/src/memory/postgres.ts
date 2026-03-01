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
