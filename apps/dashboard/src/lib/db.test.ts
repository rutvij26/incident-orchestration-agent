import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQueryFn = vi.fn().mockResolvedValue({ rows: [] });
const MockPool = vi.fn().mockImplementation(() => ({ query: mockQueryFn }));

vi.mock("pg", () => ({ default: { Pool: MockPool } }));

describe("db", () => {
  beforeEach(() => {
    // Reset singleton so each test starts fresh
    globalThis._pgPool = undefined;
    MockPool.mockClear();
    mockQueryFn.mockClear();
  });

  it("throws when POSTGRES_URL is not set", async () => {
    delete process.env.POSTGRES_URL;
    const { getPool } = await import("./db");
    expect(() => getPool()).toThrow("POSTGRES_URL environment variable is not set");
  });

  it("creates a new pool when POSTGRES_URL is set", async () => {
    process.env.POSTGRES_URL = "postgresql://test";
    const { getPool } = await import("./db");
    const p = getPool();
    expect(MockPool).toHaveBeenCalledWith({ connectionString: "postgresql://test", max: 5 });
    expect(p).toBeDefined();
  });

  it("returns the same pool on subsequent calls (singleton)", async () => {
    process.env.POSTGRES_URL = "postgresql://test";
    const { getPool } = await import("./db");
    const p1 = getPool();
    const p2 = getPool();
    expect(p1).toBe(p2);
    expect(MockPool).toHaveBeenCalledTimes(1);
  });

  it("pool.query delegates to pool", async () => {
    process.env.POSTGRES_URL = "postgresql://test";
    mockQueryFn.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const { pool } = await import("./db");
    const result = await pool.query("SELECT 1", []);
    expect(mockQueryFn).toHaveBeenCalledWith("SELECT 1", []);
    expect(result.rows).toEqual([{ id: 1 }]);
  });
});
