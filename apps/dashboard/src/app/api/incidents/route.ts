import { NextRequest, NextResponse } from "next/server";
import { getIncidents } from "@/lib/queries/incidents";
import type { IncidentStatus } from "@agentic/shared";

const VALID_STATUSES: IncidentStatus[] = ["open", "acknowledged", "resolved"];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const statusParam = searchParams.get("status");
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);

    const status =
      statusParam && VALID_STATUSES.includes(statusParam as IncidentStatus)
        ? (statusParam as IncidentStatus)
        : null;

    const result = await getIncidents({ status, limit, cursor });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
