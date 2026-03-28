import { NextRequest, NextResponse } from "next/server";
import { readConfig, writeConfig, maskValue } from "@/lib/config";
import { CONFIG_GROUPS } from "@agentic/shared";
import type { ConfigGroup } from "@agentic/shared";

function validateGroup(group: string): group is ConfigGroup {
  return (CONFIG_GROUPS as readonly string[]).includes(group);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ group: string }> }
) {
  try {
    const { group } = await params;
    if (!validateGroup(group)) {
      return NextResponse.json({ error: `Invalid group: ${group}` }, { status: 400 });
    }
    const records = await readConfig(group);
    const masked = records.map((r) => ({
      ...r,
      value: maskValue(r.key, r.value),
    }));
    return NextResponse.json(masked);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ group: string }> }
) {
  try {
    const { group } = await params;
    if (!validateGroup(group)) {
      return NextResponse.json({ error: `Invalid group: ${group}` }, { status: 400 });
    }
    const body = (await req.json()) as Array<{
      key: string;
      value: string;
      sensitive?: boolean;
    }>;
    await writeConfig(body.map((r) => ({ ...r, group })));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
