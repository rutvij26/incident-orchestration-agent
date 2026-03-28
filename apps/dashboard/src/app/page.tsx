export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { isConfigured } from "@/lib/config";

export default async function RootPage() {
  let configured = false;
  try {
    configured = await isConfigured();
  } catch {
    // DB not ready — send to setup
  }
  redirect(configured ? "/overview" : "/setup");
}
