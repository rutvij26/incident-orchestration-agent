import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const [incidents, fixes, lastRun] = await Promise.all([
      pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM incident_memory"),
      pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM auto_fix_attempts"),
      pool.query<{ started_at: Date; status: string }>(
        "SELECT started_at, status FROM workflow_runs ORDER BY started_at DESC LIMIT 1"
      ),
    ]);
    const openIssues = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM incident_memory WHERE status = 'open' OR status IS NULL"
    );
    return NextResponse.json({
      totalIncidents: parseInt(incidents.rows[0]?.count ?? "0", 10),
      openIssues: parseInt(openIssues.rows[0]?.count ?? "0", 10),
      fixesAttempted: parseInt(fixes.rows[0]?.count ?? "0", 10),
      lastScan: lastRun.rows[0]?.started_at ?? null,
      lastScanStatus: lastRun.rows[0]?.status ?? null,
    });
  } catch {
    return NextResponse.json({
      totalIncidents: 0,
      openIssues: 0,
      fixesAttempted: 0,
      lastScan: null,
      lastScanStatus: null,
    });
  }
}
