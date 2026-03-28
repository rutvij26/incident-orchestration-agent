import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ pool: { query: mockQuery } }));

import { GET } from "./route";

beforeEach(() => mockQuery.mockReset());

describe("GET /api/overview/stats", () => {
  it("returns stats from database", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: "5" }] })  // incidents
      .mockResolvedValueOnce({ rows: [{ count: "2" }] })  // fixes
      .mockResolvedValueOnce({ rows: [{ started_at: new Date("2024-01-01"), status: "completed" }] }) // lastRun
      .mockResolvedValueOnce({ rows: [{ count: "3" }] }); // openIssues

    const res = await GET();
    const data = await res.json();
    expect(data.totalIncidents).toBe(5);
    expect(data.fixesAttempted).toBe(2);
    expect(data.openIssues).toBe(3);
    expect(data.lastScanStatus).toBe("completed");
    expect(data.lastScan).toBeDefined();
  });

  it("returns zeros and nulls when rows are empty", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await GET();
    const data = await res.json();
    expect(data.totalIncidents).toBe(0);
    expect(data.fixesAttempted).toBe(0);
    expect(data.openIssues).toBe(0);
    expect(data.lastScan).toBeNull();
    expect(data.lastScanStatus).toBeNull();
  });

  it("returns zero-state on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB down"));
    const res = await GET();
    const data = await res.json();
    expect(data.totalIncidents).toBe(0);
    expect(data.openIssues).toBe(0);
    expect(data.fixesAttempted).toBe(0);
    expect(data.lastScan).toBeNull();
    expect(data.lastScanStatus).toBeNull();
  });
});
