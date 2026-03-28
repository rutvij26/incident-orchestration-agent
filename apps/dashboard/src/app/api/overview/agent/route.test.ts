import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ pool: { query: mockQuery } }));

import { GET } from "./route";

beforeEach(() => mockQuery.mockReset());

describe("GET /api/overview/agent", () => {
  it("returns the latest workflow run", async () => {
    const row = { id: "run-1", started_at: new Date().toISOString(), completed_at: null, status: "running", logs_scanned: 50, incidents_found: 2, issues_opened: 1, fixes_attempted: 0, error_message: null };
    mockQuery.mockResolvedValueOnce({ rows: [row] });

    const res = await GET();
    const data = await res.json();
    expect(data.id).toBe("run-1");
    expect(data.status).toBe("running");
  });

  it("returns null when no runs exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const res = await GET();
    const data = await res.json();
    expect(data).toBeNull();
  });

  it("returns null on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("DB error"));
    const res = await GET();
    const data = await res.json();
    expect(data).toBeNull();
  });
});
