import { pool } from "@/lib/db";
import type { IncidentStatus } from "@agentic/shared";

export interface IncidentRow {
  id: string;
  title: string;
  severity: string;
  status: string | null;
  issue_url: string | null;
  pr_url: string | null;
  first_seen: string;
  last_seen: string;
  event_count: number;
  created_at: string | null;
}

export async function getIncidents(params: {
  status?: IncidentStatus | null;
  limit?: number;
  cursor?: string | null;
}): Promise<{ data: IncidentRow[]; nextCursor: string | null }> {
  const limit = params.limit ?? 50;
  const values: unknown[] = [];

  const conditions: string[] = [];

  if (params.status) {
    values.push(params.status);
    conditions.push(`status = $${values.length}`);
  }

  if (params.cursor) {
    // cursor = "ISO_TIMESTAMP__UUID"
    const sep = params.cursor.lastIndexOf("__");
    const ts = params.cursor.slice(0, sep);
    const id = params.cursor.slice(sep + 2);
    values.push(ts, id);
    conditions.push(
      `(COALESCE(created_at, last_seen), id) < ($${values.length - 1}::timestamptz, $${values.length}::text)`
    );
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(limit + 1);

  const result = await pool.query<IncidentRow>(`
    SELECT id, title, severity, status, issue_url, pr_url,
           first_seen, last_seen, event_count, created_at
    FROM incident_memory
    ${where}
    ORDER BY COALESCE(created_at, last_seen) DESC, id DESC
    LIMIT $${values.length}
  `, values);

  const rows = result.rows;
  let nextCursor: string | null = null;
  if (rows.length > limit) {
    rows.pop();
    const last = rows[rows.length - 1];
    if (last) {
      const ts = last.created_at ?? last.last_seen;
      nextCursor = `${ts}__${last.id}`;
    }
  }

  return { data: rows, nextCursor };
}

export async function updateIncidentStatus(
  id: string,
  status: IncidentStatus
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE incident_memory SET status = $2 WHERE id = $1`,
    [id, status]
  );
  return (result.rowCount ?? 0) > 0;
}
