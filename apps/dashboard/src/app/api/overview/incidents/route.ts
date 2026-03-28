import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT id, title, severity, status, issue_url, created_at, last_seen
       FROM incident_memory
       ORDER BY COALESCE(created_at, last_seen) DESC
       LIMIT 10`
    );
    return NextResponse.json(result.rows);
  } catch {
    return NextResponse.json([]);
  }
}
