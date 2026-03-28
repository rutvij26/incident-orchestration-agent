import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/config";

export async function GET() {
  try {
    const configured = await isConfigured();
    return NextResponse.json({ configured });
  } catch (err) {
    // If DB is not reachable yet, treat as not configured
    console.error("setup/status error:", err);
    return NextResponse.json({ configured: false });
  }
}
