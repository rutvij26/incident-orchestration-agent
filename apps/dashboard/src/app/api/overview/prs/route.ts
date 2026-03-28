import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT id, incident_id, pr_url, outcome, tests_passed, plan_summary, created_at
       FROM auto_fix_attempts
       WHERE pr_url IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 5`
    );
    return NextResponse.json(result.rows);
  } catch {
    return NextResponse.json([]);
  }
}
