import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

let sdk: NodeSDK | null = null;

export async function startTelemetry(): Promise<void> {
  if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT === undefined) {
    return;
  }

  const traceExporter = new OTLPTraceExporter();
  sdk = new NodeSDK({
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  await sdk.start();
}

export async function stopTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
  }
}
