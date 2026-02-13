import { Client, Connection } from "@temporalio/client";
import { getConfig } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { incidentOrchestrationWorkflow } from "./workflows/incidentWorkflow.js";
import "./lib/env.js";

const CONNECTION_TIMEOUT_MS = 15000;
const WORKFLOW_TIMEOUT_MS = 120000;
const LOOKBACK_MINUTES = 15;
const DEFAULT_QUERY = '{job="demo-services"}';

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

async function runOnce(): Promise<void> {
  const { TEMPORAL_ADDRESS, AUTO_ESCALATE_FROM } = getConfig();

  logger.info("Starting workflow run", {
    temporalAddress: TEMPORAL_ADDRESS,
    autoEscalateFrom: AUTO_ESCALATE_FROM,
    lookbackMinutes: LOOKBACK_MINUTES,
    query: DEFAULT_QUERY,
  });

  logger.info("Connecting to Temporal", { temporalAddress: TEMPORAL_ADDRESS });
  const connection = await withTimeout(
    Connection.connect({
      address: TEMPORAL_ADDRESS,
    }),
    CONNECTION_TIMEOUT_MS,
    "Temporal connection"
  );
  logger.info("Connected to Temporal");

  const client = new Client({
    namespace: "default",
    connection,
  });

  logger.info("Starting incident workflow execution");
  const result = await withTimeout(
    client.workflow.execute(incidentOrchestrationWorkflow, {
    taskQueue: "incident-orchestration",
    workflowId: `incident-orchestration-${Date.now()}`,
      workflowExecutionTimeout: "2 minutes",
    args: [
      {
          lookbackMinutes: LOOKBACK_MINUTES,
          query: DEFAULT_QUERY,
          autoEscalateFrom: AUTO_ESCALATE_FROM,
      },
    ],
    }),
    WORKFLOW_TIMEOUT_MS,
    "Workflow execution"
  );

  logger.info("Workflow completed", result as Record<string, unknown>);
}

runOnce().catch((error) => {
  const payload =
    error instanceof Error
      ? { message: error.message, stack: error.stack }
      : error;
  logger.error("Workflow failed", { error: payload });
  process.exit(1);
});
