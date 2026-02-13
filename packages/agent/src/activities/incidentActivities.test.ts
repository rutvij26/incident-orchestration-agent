import { describe, expect, it } from "vitest";
import { detectIncidents } from "./incidentActivities.js";
import type { LogEvent } from "../lib/types.js";

const now = String(Date.now() * 1_000_000);

describe("detectIncidents", () => {
  it("classifies error bursts and latency signals", async () => {
    const logs: LogEvent[] = [
      {
        timestamp: now,
        message: JSON.stringify({
          type: "error_burst",
          route: "/api/orders",
          msg: "Synthetic error burst",
        }),
        labels: { job: "demo-services" },
      },
      {
        timestamp: now,
        message: JSON.stringify({
          route: "/slow",
          msg: "Slow response",
        }),
        labels: { job: "demo-services" },
      },
    ];

    const incidents = await detectIncidents(logs);
    const severities = incidents.map((item) => item.incident.severity);

    expect(severities).toContain("high");
    expect(severities).toContain("medium");
  });
});
