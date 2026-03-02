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

  // INTENTIONAL CRITICAL BUG: `items` is not null-guarded before `.reduce()`.
  // When the request body omits `items` (or sends null), this throws:
  //   TypeError: Cannot read properties of null (reading 'reduce')
  // Fix: change `items` → `(items ?? [])` on the reduce call.
  app.post("/api/orders", (req, res) => {
    try {
      const { items } = req.body ?? {};
      const total = ((items ?? []) as Array<{ price: number; qty: number }>).reduce(
        (sum, item) => sum + item.price * item.qty,
        0,
      );
      logger.info({ total, route: "/api/orders" }, "Order processed");
      res.json({ ok: true, total });
    } catch (error) {
      logger.error(
        {
          severity: "critical",
          type: "null_reference_order_items",
          route: "/api/orders",
          error: String(error),
          impact: "all_orders_failing",
          error_rate: 1.0,
        },
        "CRITICAL: /api/orders crashed — null reference on items.reduce()",
      );
      res.status(500).json({ error: "Order processing failed" });
    }
  });

  if (process.env.SIMULATE_INCIDENTS === "true") {
    setInterval(() => {
      // Simulate the /api/orders null-reference crash that happens in production
      // when a client sends a request body without the `items` field.
      logger.error(
        {
          severity: "critical",
          type: "null_reference_order_items",
          route: "/api/orders",
          error: "TypeError: Cannot read properties of null (reading 'reduce')",
          stack: "at Array.reduce (<anonymous>)\n    at app.post (src/index.ts:61:60)",
          impact: "all_orders_failing",
          error_rate: Math.random() * 0.2 + 0.8,
        },
        "CRITICAL: /api/orders crashed — null reference on items.reduce()",
      );
    }, 15000);
  }

  // Flood logs with critical-severity entries to trigger the incident agent.
  // Mirrors exactly what happens when /api/orders is called without a body.
  // Toggle with: SIMULATE_CRITICAL_BUG=true
  if (process.env.SIMULATE_CRITICAL_BUG === "true") {
    logger.warn(
      { route: "/api/orders" },
      "Critical bug simulation enabled — order processing is completely down",
    );
    setInterval(() => {
      try {
        // Reproduces the production code path: null items → .reduce() throws
        const items: unknown = null;
        (items as Array<{ price: number; qty: number }>).reduce(
          (sum, item) => sum + item.price * item.qty,
          0,
        );
      } catch (error) {
        logger.error(
          {
            severity: "critical",
            type: "null_reference_order_items",
            route: "/api/orders",
            error: String(error),
            impact: "all_orders_failing",
            error_rate: 1.0,
          },
          "CRITICAL: /api/orders crashed — null reference on items.reduce()",
        );
      }
    }, 3000);
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
