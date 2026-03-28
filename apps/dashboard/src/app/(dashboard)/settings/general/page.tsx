export const dynamic = "force-dynamic";
import { GeneralSettings } from "./GeneralSettings";
import { readConfig } from "@/lib/config";

export default async function GeneralPage() {
  const records = await readConfig("source");
  const get = (key: string) => records.find((r) => r.key === key)?.value ?? "";
  return (
    <GeneralSettings
      initialSourceConnectors={get("SOURCE_CONNECTORS")}
      initialEscalateFrom={get("AUTO_ESCALATE_FROM")}
    />
  );
}
