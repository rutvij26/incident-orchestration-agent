import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import pino from "pino";
import { startTelemetry, stopTelemetry } from "./observability.js";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

process.env.OTEL_SERVICE_NAME =
  process.env.OTEL_SERVICE_NAME ?? process.env.DEMO_OTEL_SERVICE_NAME;

const app = express();
app.use(express.json());

const logPath = process.env.LOG_PATH ?? "logs/demo-services.log";
const logDir = path.dirname(logPath);
fs.mkdirSync(logDir, { recursive: true });

const logger = pino(
  {
    base: { service: "demo-services" },
  },
  pino.destination({ dest: logPath, sync: false })
);

async function main(): Promise<void> {
  await startTelemetry();

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/slow", async (_req, res) => {
    const delayMs = Math.floor(Math.random() * 1400) + 200;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    logger.warn({ delay_ms: delayMs, route: "/slow" }, "Slow response");
    res.json({ ok: true, delayMs });
  });

  app.get("/error", (_req, res) => {
    logger.error({ route: "/error" }, "Simulated error");
    res.status(500).json({ error: "Simulated error" });
  });

  app.post("/auth/login", (req, res) => {
    const { user } = req.body ?? {};
    logger.warn({ user, route: "/auth/login" }, "Failed login attempt");
    res.status(401).json({ error: "Unauthorized" });
  });

  if (process.env.SIMULATE_INCIDENTS === "true") {
    setInterval(() => {
      logger.error(
        {
          type: "error_burst",
          route: "/api/orders",
          error_rate: Math.random() * 0.3 + 0.1,
        },
        "Synthetic error burst"
      );
    }, 15000);
  }

  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => {
    logger.info({ port }, "Demo service listening");
  });
}

process.on("SIGINT", async () => {
  await stopTelemetry();
  process.exit(0);
});

main().catch((error) => {
  logger.error({ error }, "Demo service crashed");
  process.exit(1);
});
