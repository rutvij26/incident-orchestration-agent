import { NextRequest, NextResponse } from "next/server";
import { readConfig, writeConfig, maskValue } from "@/lib/config";
import type { ConfigGroup } from "@agentic/shared";

export async function GET() {
  try {
    const records = await readConfig();
    const masked = records.map((r) => ({
      ...r,
      value: maskValue(r.key, r.value),
    }));
    return NextResponse.json(masked);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as Array<{
      key: string;
      value: string;
      group: ConfigGroup;
      sensitive?: boolean;
    }>;
    await writeConfig(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
