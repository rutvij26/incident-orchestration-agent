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
