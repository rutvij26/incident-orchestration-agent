import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ pool: { query: mockQuery } }));

import { GET } from "./route";

beforeEach(() => mockQuery.mockReset());

describe("GET /api/overview/prs", () => {
  it("returns PR rows from database", async () => {
    const rows = [{ id: "1", incident_id: "inc-1", pr_url: "https://github.com/pr/1", outcome: "success", tests_passed: true, plan_summary: "Fix bug", created_at: new Date().toISOString() }];
    mockQuery.mockResolvedValueOnce({ rows });

    const res = await GET();
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].pr_url).toBe("https://github.com/pr/1");
  });

  it("returns empty array on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("timeout"));
    const res = await GET();
    const data = await res.json();
    expect(data).toEqual([]);
  });
});
