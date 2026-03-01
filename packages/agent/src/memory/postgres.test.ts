import { describe, expect, it, vi, afterEach } from "vitest";

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn();

vi.mock("pg", () => ({
  default: {
    Pool: class {
      connect = mockConnect;
    },
  },
}));

vi.mock("../lib/config.js", () => ({
  getConfig: vi.fn(() => ({ POSTGRES_URL: "postgresql://test:test@localhost/test" })),
}));

import {
  initMemory,
  saveIncidents,
  recordAutoFixAttempt,
  getRecentAutoFixAttempts,
} from "./postgres.js";
import type { Incident } from "../lib/types.js";

const client = { query: mockQuery, release: mockRelease };

const sampleIncident: Incident = {
  id: "inc-1",
  title: "Test incident",
  severity: "high",
  evidence: ["log line 1"],
  firstSeen: "1700000000000000000",
  lastSeen: "1700000001000000000",
  count: 3,
};

afterEach(() => {
  mockQuery.mockReset();
  mockRelease.mockReset();
  mockConnect.mockReset();
  mockConnect.mockResolvedValue(client);
});

describe("initMemory", () => {
  it("creates tables and index without error", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({});
    await expect(initMemory()).resolves.toBeUndefined();
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("incident_memory")
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("auto_fix_attempts")
    );
    expect(mockRelease).toHaveBeenCalled();
  });

  it("releases the client even if a query throws", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockRejectedValueOnce(new Error("extension error"));
    await expect(initMemory()).rejects.toThrow("extension error");
    expect(mockRelease).toHaveBeenCalled();
  });
});

describe("saveIncidents", () => {
  it("is a no-op when passed an empty array", async () => {
    await saveIncidents([]);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("upserts each incident into postgres", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({});
    await saveIncidents([sampleIncident]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT"),
      expect.arrayContaining(["inc-1", "Test incident", "high"])
    );
    expect(mockRelease).toHaveBeenCalled();
  });

  it("upserts multiple incidents", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({});
    const second = { ...sampleIncident, id: "inc-2" };
    await saveIncidents([sampleIncident, second]);
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("releases client even if query fails", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockRejectedValueOnce(new Error("constraint violation"));
    await expect(saveIncidents([sampleIncident])).rejects.toThrow(
      "constraint violation"
    );
    expect(mockRelease).toHaveBeenCalled();
  });
});

describe("recordAutoFixAttempt", () => {
  it("inserts a record with all fields", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({});
    await recordAutoFixAttempt({
      incidentId: "inc-1",
      issueNumber: 42,
      outcome: "pr_created",
      reason: "fix applied",
      fixabilityScore: 0.85,
    });
    const [, args] = mockQuery.mock.calls[0];
    expect(args).toEqual(["inc-1", 42, "pr_created", "fix applied", 0.85]);
    expect(mockRelease).toHaveBeenCalled();
  });

  it("inserts null for missing optional fields", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({});
    await recordAutoFixAttempt({
      incidentId: "inc-1",
      issueNumber: 1,
      outcome: "failed",
    });
    const [, args] = mockQuery.mock.calls[0];
    expect(args[3]).toBeNull();
    expect(args[4]).toBeNull();
  });

  it("releases client even on query error", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockRejectedValueOnce(new Error("db down"));
    await expect(
      recordAutoFixAttempt({ incidentId: "i", issueNumber: 1, outcome: "failed" })
    ).rejects.toThrow("db down");
    expect(mockRelease).toHaveBeenCalled();
  });
});

describe("getRecentAutoFixAttempts", () => {
  it("returns mapped attempt rows", async () => {
    mockConnect.mockResolvedValue(client);
    const now = new Date();
    mockQuery.mockResolvedValue({
      rows: [{ outcome: "failed", reason: "sandbox_fail", created_at: now }],
    });
    const results = await getRecentAutoFixAttempts({
      incidentId: "inc-1",
      issueNumber: 5,
    });
    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe("failed");
    expect(results[0].reason).toBe("sandbox_fail");
    expect(results[0].created_at).toBe(now);
    expect(mockRelease).toHaveBeenCalled();
  });

  it("uses default limit of 10", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({ rows: [] });
    await getRecentAutoFixAttempts({ incidentId: "inc-1", issueNumber: 1 });
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["inc-1", 1, 10]);
  });

  it("uses a custom limit when provided", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({ rows: [] });
    await getRecentAutoFixAttempts({
      incidentId: "inc-1",
      issueNumber: 1,
      limit: 20,
    });
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["inc-1", 1, 20]);
  });

  it("releases client even on query error", async () => {
    mockConnect.mockResolvedValue(client);
    mockQuery.mockRejectedValueOnce(new Error("timeout"));
    await expect(
      getRecentAutoFixAttempts({ incidentId: "i", issueNumber: 1 })
    ).rejects.toThrow("timeout");
    expect(mockRelease).toHaveBeenCalled();
  });
});
