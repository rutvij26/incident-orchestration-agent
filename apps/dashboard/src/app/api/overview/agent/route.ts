import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT id, started_at, completed_at, status, logs_scanned,
              incidents_found, issues_opened, fixes_attempted, error_message
       FROM workflow_runs
       ORDER BY started_at DESC
       LIMIT 1`
    );
    return NextResponse.json(result.rows[0] ?? null);
  } catch {
    return NextResponse.json(null);
  }
}
