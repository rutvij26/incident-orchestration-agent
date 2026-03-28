import { NextResponse } from "next/server";
import { Connection, Client } from "@temporalio/client";

declare global {
  // eslint-disable-next-line no-var
  var _temporalClient: Client | undefined;
  // eslint-disable-next-line no-var
  var _temporalConnection: Connection | undefined;
}

async function getTemporalClient(): Promise<Client> {
  if (globalThis._temporalClient) return globalThis._temporalClient;

  const temporalAddress = process.env.TEMPORAL_ADDRESS;
  if (!temporalAddress) throw new Error("TEMPORAL_ADDRESS not set");

  const connection = await Connection.connect({ address: temporalAddress });
  const client = new Client({ connection });
  globalThis._temporalConnection = connection;
  globalThis._temporalClient = client;
  return client;
}

export async function POST() {
  try {
    const client = await getTemporalClient();

    // Fixed workflowId for manual runs — Temporal rejects if already running
    const workflowId = "incident-orchestration-manual";

    try {
      const handle = await client.workflow.start("incidentOrchestrationWorkflow", {
        taskQueue: "incident-orchestration",
        workflowId,
        workflowExecutionTimeout: "120s",
        args: [
          {
            lookbackMinutes: 15,
            query: process.env.LOKI_QUERY ?? '{job="demo-services"}',
            autoEscalateFrom: process.env.AUTO_ESCALATE_FROM ?? "high",
          },
        ],
      });
      return NextResponse.json({ ok: true, workflowId: handle.workflowId });
    } catch (err: unknown) {
      // Temporal throws when a workflow with the same ID is already running
      const msg = String(err);
      if (msg.includes("already") || msg.includes("AlreadyExists") || msg.includes("ALREADY_EXISTS")) {
        return NextResponse.json(
          { ok: false, error: "A workflow run is already in progress." },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (err: unknown) {
    // Clear singleton so next request reconnects
    globalThis._temporalClient = undefined;
    globalThis._temporalConnection = undefined;
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
