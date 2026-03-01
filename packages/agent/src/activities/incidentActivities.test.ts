import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("../lib/loki.js", () => ({ queryLoki: vi.fn() }));
vi.mock("../lib/github.js", () => ({ createIssue: vi.fn() }));
vi.mock("../memory/postgres.js", () => ({
  initMemory: vi.fn().mockResolvedValue(undefined),
  saveIncidents: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/llm.js", () => ({ summarizeIncident: vi.fn() }));
vi.mock("../autofix/autoFix.js", () => ({ autoFixIncident: vi.fn() }));
vi.mock("../rag/repoCache.js", () => ({ refreshRepoCache: vi.fn() }));

import {
  fetchRecentLogs,
  detectIncidents,
  persistIncidents,
  createIssueForIncident,
  summarizeIncident,
  autoFixIncident,
  refreshRepoCache,
} from "./incidentActivities.js";
import { queryLoki } from "../lib/loki.js";
import { createIssue } from "../lib/github.js";
import { initMemory, saveIncidents } from "../memory/postgres.js";
import {
  summarizeIncident as llmSummarize,
} from "../lib/llm.js";
import { autoFixIncident as runAutoFix } from "../autofix/autoFix.js";
import { refreshRepoCache as repoCacheRefresh } from "../rag/repoCache.js";
import type { Incident, IncidentSummary, LogEvent } from "../lib/types.js";

const now = String(Date.now() * 1_000_000);

const sampleIncident: Incident = {
  id: "inc-1",
  title: "Incident: error_burst (error_burst:/api)",
  severity: "high",
  evidence: ["Synthetic error burst"],
  firstSeen: now,
  lastSeen: now,
  count: 5,
};

const sampleSummary: IncidentSummary = {
  summary: "Error spike on /api",
  rootCause: "Upstream failure",
  recommendedActions: ["Check upstream", "Add circuit breaker"],
  suggestedSeverity: "high",
  suggestedLabels: ["api", "errors"],
  confidence: 0.85,
};

afterEach(() => vi.clearAllMocks());

// ─── fetchRecentLogs ────────────────────────────────────────────────────────

describe("fetchRecentLogs", () => {
  it("delegates to queryLoki with the provided query and lookback", async () => {
    const events: LogEvent[] = [
      { timestamp: now, message: "hello", labels: { job: "api" } },
    ];
    vi.mocked(queryLoki).mockResolvedValue(events);

    const result = await fetchRecentLogs({
      query: '{job="api"}',
      lookbackMinutes: 15,
    });

    expect(queryLoki).toHaveBeenCalledWith('{job="api"}', 15);
    expect(result).toBe(events);
  });
});

// ─── detectIncidents ────────────────────────────────────────────────────────

describe("detectIncidents", () => {
  it("classifies error_burst logs as high severity", async () => {
    const logs: LogEvent[] = [
      {
        timestamp: now,
        message: JSON.stringify({ type: "error_burst", route: "/api", msg: "Synthetic error burst" }),
        labels: {},
      },
    ];
    const incidents = await detectIncidents(logs);
    expect(incidents.some((i) => i.incident.severity === "high")).toBe(true);
  });

  it("classifies slow response logs as medium severity", async () => {
    const logs: LogEvent[] = [
      { timestamp: now, message: JSON.stringify({ route: "/slow", msg: "Slow response" }), labels: {} },
    ];
    const incidents = await detectIncidents(logs);
    expect(incidents.some((i) => i.incident.severity === "medium")).toBe(true);
  });

  it("classifies simulated error logs as high severity", async () => {
    const logs: LogEvent[] = [
      { timestamp: now, message: "Simulated error on /api", labels: {} },
    ];
    const incidents = await detectIncidents(logs);
    expect(incidents[0].incident.severity).toBe("high");
  });

  it("classifies failed login attempts as low severity", async () => {
    const logs: LogEvent[] = [
      { timestamp: now, message: "Failed login attempt on /auth", labels: {} },
    ];
    const incidents = await detectIncidents(logs);
    expect(incidents[0].incident.severity).toBe("low");
  });

  it("classifies unknown messages as low severity", async () => {
    const logs: LogEvent[] = [
      { timestamp: now, message: "random log line", labels: {} },
    ];
    const incidents = await detectIncidents(logs);
    expect(incidents[0].incident.severity).toBe("low");
  });

  it("buckets multiple logs with the same key into one incident", async () => {
    const logs: LogEvent[] = [
      { timestamp: now, message: JSON.stringify({ type: "error_burst", route: "/api", msg: "burst" }), labels: {} },
      { timestamp: now, message: JSON.stringify({ type: "error_burst", route: "/api", msg: "burst" }), labels: {} },
    ];
    const incidents = await detectIncidents(logs);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].incident.count).toBe(2);
  });

  it("creates separate incidents for different keys", async () => {
    const logs: LogEvent[] = [
      { timestamp: now, message: JSON.stringify({ type: "error_burst", route: "/api", msg: "burst" }), labels: {} },
      { timestamp: now, message: "Slow response on /checkout", labels: {} },
    ];
    const incidents = await detectIncidents(logs);
    expect(incidents).toHaveLength(2);
  });

  it("includes up to 5 evidence samples per incident", async () => {
    const logs = Array.from({ length: 8 }, () => ({
      timestamp: now,
      message: JSON.stringify({ type: "error_burst", route: "/api", msg: "burst" }),
      labels: {},
    }));
    const incidents = await detectIncidents(logs);
    expect(incidents[0].incident.evidence.length).toBeLessThanOrEqual(5);
  });

  it("handles non-JSON messages gracefully", async () => {
    const logs: LogEvent[] = [
      { timestamp: now, message: "not json at all", labels: {} },
    ];
    const incidents = await detectIncidents(logs);
    expect(incidents).toHaveLength(1);
  });

  it("returns empty array for empty log input", async () => {
    expect(await detectIncidents([])).toEqual([]);
  });
});

// ─── persistIncidents ───────────────────────────────────────────────────────

describe("persistIncidents", () => {
  it("calls initMemory then saveIncidents", async () => {
    await persistIncidents([sampleIncident]);
    expect(initMemory).toHaveBeenCalled();
    expect(saveIncidents).toHaveBeenCalledWith([sampleIncident]);
  });
});

// ─── createIssueForIncident ─────────────────────────────────────────────────

describe("createIssueForIncident", () => {
  it("creates issue with LLM enrichment section when summary is provided", async () => {
    vi.mocked(createIssue).mockResolvedValue({
      created: true,
      url: "https://github.com/o/r/issues/1",
      number: 1,
    });
    const result = await createIssueForIncident(sampleIncident, sampleSummary);
    expect(result.created).toBe(true);
    const body = vi.mocked(createIssue).mock.calls[0][0].body;
    expect(body).toContain("Error spike on /api");
    expect(body).toContain("Check upstream");
    expect(body).toContain("api");
  });

  it("creates issue with 'not configured' note when no summary provided", async () => {
    vi.mocked(createIssue).mockResolvedValue({
      created: true,
      url: "https://github.com/o/r/issues/2",
      number: 2,
    });
    const result = await createIssueForIncident(sampleIncident, null);
    expect(result.created).toBe(true);
    const body = vi.mocked(createIssue).mock.calls[0][0].body;
    expect(body).toContain("not_configured_or_failed");
  });

  it("includes no suggested labels text when summary has empty labels", async () => {
    vi.mocked(createIssue).mockResolvedValue({ created: true, url: "u", number: 1 });
    await createIssueForIncident(sampleIncident, {
      ...sampleSummary,
      suggestedLabels: [],
    });
    const body = vi.mocked(createIssue).mock.calls[0][0].body;
    expect(body).toContain("_none_");
  });

  it("shows no evidence placeholder when evidence array is empty", async () => {
    vi.mocked(createIssue).mockResolvedValue({ created: true, url: "u", number: 1 });
    await createIssueForIncident({ ...sampleIncident, evidence: [] });
    const body = vi.mocked(createIssue).mock.calls[0][0].body;
    expect(body).toContain("_No evidence samples");
  });

  it("passes incident and high severity label to createIssue", async () => {
    vi.mocked(createIssue).mockResolvedValue({ created: true, url: "u", number: 1 });
    await createIssueForIncident(sampleIncident);
    const call = vi.mocked(createIssue).mock.calls[0][0];
    expect(call.labels).toContain("incident");
    expect(call.labels).toContain("high");
  });
});

// ─── summarizeIncident ───────────────────────────────────────────────────────

describe("summarizeIncident", () => {
  it("delegates to the LLM summarizer", async () => {
    vi.mocked(llmSummarize).mockResolvedValue(sampleSummary);
    const result = await summarizeIncident(sampleIncident);
    expect(llmSummarize).toHaveBeenCalledWith(sampleIncident);
    expect(result).toBe(sampleSummary);
  });

  it("returns null when LLM returns null", async () => {
    vi.mocked(llmSummarize).mockResolvedValue(null);
    expect(await summarizeIncident(sampleIncident)).toBeNull();
  });
});

// ─── autoFixIncident ─────────────────────────────────────────────────────────

describe("autoFixIncident", () => {
  it("delegates to runAutoFix and returns the result", async () => {
    vi.mocked(runAutoFix).mockResolvedValue({
      status: "pr_created",
      prUrl: "https://github.com/o/r/pull/1",
    });
    const result = await autoFixIncident({
      incident: sampleIncident,
      summary: sampleSummary,
      issueNumber: 1,
    });
    expect(result.status).toBe("pr_created");
    expect(result.prUrl).toBe("https://github.com/o/r/pull/1");
  });
});

// ─── refreshRepoCache ────────────────────────────────────────────────────────

describe("refreshRepoCache", () => {
  it("returns ok:true and the repo path on success", async () => {
    vi.mocked(repoCacheRefresh).mockResolvedValue("/repos/owner-repo");
    const result = await refreshRepoCache();
    expect(result.ok).toBe(true);
    expect(result.path).toBe("/repos/owner-repo");
  });

  it("returns ok:false with reason on failure", async () => {
    vi.mocked(repoCacheRefresh).mockRejectedValue(
      new Error("git clone failed: auth error")
    );
    const result = await refreshRepoCache();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("git clone failed");
  });
});
