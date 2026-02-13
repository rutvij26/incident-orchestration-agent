import { Client, Connection } from "@temporalio/client";
import { getConfig } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { incidentOrchestrationWorkflow } from "./workflows/incidentWorkflow.js";
import "./lib/env.js";

async function runOnce(): Promise<void> {
  const { TEMPORAL_ADDRESS, AUTO_ESCALATE_FROM } = getConfig();

  const connection = await Connection.connect({
    address: TEMPORAL_ADDRESS,
  });

  const client = new Client({
    namespace: "default",
    connection,
  });

  const result = await client.workflow.execute(incidentOrchestrationWorkflow, {
    taskQueue: "incident-orchestration",
    workflowId: `incident-orchestration-${Date.now()}`,
    args: [
      {
        lookbackMinutes: 15,
        query: '{job="demo-services"}',
        autoEscalateFrom: AUTO_ESCALATE_FROM,
      },
    ],
  });

  logger.info("Workflow completed", result as Record<string, unknown>);
}

runOnce().catch((error) => {
  logger.error("Workflow failed", { error });
  process.exit(1);
});
