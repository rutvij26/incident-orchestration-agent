import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/config", () => ({
  readConfig: vi.fn(),
  writeConfig: vi.fn(),
  maskValue: vi.fn((key: string, value: string) => (value ? "••••" : value)),
}));

import { GET, PUT } from "./route";
import { readConfig, writeConfig } from "@/lib/config";

const fakeRecord = { key: "LOKI_URL", value: "http://loki", encrypted: false, groupName: "source", updatedAt: new Date() };

beforeEach(() => {
  vi.mocked(readConfig).mockReset();
  vi.mocked(writeConfig).mockReset();
});

describe("GET /api/config", () => {
  it("returns masked config records", async () => {
    vi.mocked(readConfig).mockResolvedValueOnce([fakeRecord]);
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns 500 on error", async () => {
    vi.mocked(readConfig).mockRejectedValueOnce(new Error("DB down"));
    const res = await GET();
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("DB down");
  });
});

describe("PUT /api/config", () => {
  it("writes config and returns ok", async () => {
    vi.mocked(writeConfig).mockResolvedValueOnce();
    const req = new Request("http://localhost/api/config", {
      method: "PUT",
      body: JSON.stringify([{ key: "LOKI_URL", value: "http://loki", group: "source" }]),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req as Parameters<typeof PUT>[0]);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("returns 500 on write error", async () => {
    vi.mocked(writeConfig).mockRejectedValueOnce(new Error("Write failed"));
    const req = new Request("http://localhost/api/config", {
      method: "PUT",
      body: JSON.stringify([]),
      headers: { "content-type": "application/json" },
    });
    const res = await PUT(req as Parameters<typeof PUT>[0]);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("Write failed");
  });
});
