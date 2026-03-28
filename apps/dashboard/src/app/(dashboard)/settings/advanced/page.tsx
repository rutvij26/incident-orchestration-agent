export const dynamic = "force-dynamic";
import { AdvancedSettings } from "./AdvancedSettings";
import { readConfig } from "@/lib/config";

export default async function AdvancedPage() {
  const records = await readConfig("bootstrap");
  const get = (key: string) => records.find((r) => r.key === key)?.value ?? "";
  const temporalAddress = get("TEMPORAL_ADDRESS") || process.env.TEMPORAL_ADDRESS || "localhost:7233";
  const otelEndpoint = get("OTEL_EXPORTER_OTLP_ENDPOINT") || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "";
  return (
    <AdvancedSettings
      temporalAddress={temporalAddress}
      initialOtelEndpoint={otelEndpoint}
    />
  );
}
