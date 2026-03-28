import { NextRequest, NextResponse } from "next/server";
import { getAutofixAttempts } from "@/lib/queries/autofix";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const cursor = searchParams.get("cursor");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);

    const result = await getAutofixAttempts({ limit, cursor });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
