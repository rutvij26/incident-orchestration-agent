import { pool } from "@/lib/db";

export interface AutofixRow {
  id: string;
  incident_id: string;
  incident_title: string;
  incident_severity: string;
  issue_number: number;
  outcome: string;
  reason: string | null;
  fixability_score: number | null;
  pr_url: string | null;
  tests_passed: boolean | null;
  plan_summary: string | null;
  duration_ms: number | null;
  created_at: string;
}

export async function getAutofixAttempts(params: {
  limit?: number;
  cursor?: string | null;
}): Promise<{ data: AutofixRow[]; nextCursor: string | null }> {
  const limit = params.limit ?? 50;
  const values: unknown[] = [limit + 1];

  let cursorClause = "";
  if (params.cursor) {
    const [ts, id] = params.cursor.split("__");
    values.push(ts, id);
    cursorClause = `AND (a.created_at, a.id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`;
  }

  const result = await pool.query<AutofixRow>(`
    SELECT
      a.id, a.incident_id, a.issue_number, a.outcome, a.reason,
      a.fixability_score, a.pr_url, a.tests_passed, a.plan_summary,
      a.duration_ms, a.created_at,
      i.title AS incident_title,
      i.severity AS incident_severity
    FROM auto_fix_attempts a
    JOIN incident_memory i ON i.id = a.incident_id
    WHERE 1=1 ${cursorClause}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT $1
  `, values);

  const rows = result.rows;
  let nextCursor: string | null = null;
  if (rows.length > limit) {
    rows.pop();
    const last = rows[rows.length - 1];
    if (last) {
      nextCursor = `${last.created_at}__${last.id}`;
    }
  }

  return { data: rows, nextCursor };
}
