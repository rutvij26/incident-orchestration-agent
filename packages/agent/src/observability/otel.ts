import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

let sdk: NodeSDK | null = null;

export async function startTelemetry(): Promise<void> {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return;
  }

  sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  await sdk.start();
}

export async function stopTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
  }
}
