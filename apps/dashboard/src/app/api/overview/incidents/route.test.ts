import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ pool: { query: mockQuery } }));

import { GET } from "./route";

beforeEach(() => mockQuery.mockReset());

describe("GET /api/overview/incidents", () => {
  it("returns incident rows from database", async () => {
    const fakeRows = [
      { id: "1", title: "DB error", severity: "high", status: "open", issue_url: null, created_at: new Date().toISOString(), last_seen: null },
    ];
    mockQuery.mockResolvedValueOnce({ rows: fakeRows });

    const res = await GET();
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].title).toBe("DB error");
  });

  it("returns empty array on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Connection refused"));
    const res = await GET();
    const data = await res.json();
    expect(data).toEqual([]);
  });
});
