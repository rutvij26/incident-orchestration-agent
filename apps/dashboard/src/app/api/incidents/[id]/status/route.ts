import { NextRequest, NextResponse } from "next/server";
import { updateIncidentStatus } from "@/lib/queries/incidents";
import type { IncidentStatus } from "@agentic/shared";

const VALID_STATUSES: IncidentStatus[] = ["open", "acknowledged", "resolved"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { status?: unknown };

    if (!body.status || !VALID_STATUSES.includes(body.status as IncidentStatus)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const updated = await updateIncidentStatus(id, body.status as IncidentStatus);
    if (!updated) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, status: body.status });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
