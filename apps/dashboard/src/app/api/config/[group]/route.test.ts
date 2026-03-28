import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/config", () => ({
  readConfig: vi.fn(),
  writeConfig: vi.fn(),
  maskValue: vi.fn((_key: string, value: string) => value),
}));

import { GET, PUT } from "./route";
import { readConfig, writeConfig } from "@/lib/config";

const fakeRecord = { key: "LOKI_URL", value: "http://loki", encrypted: false, groupName: "source" as const, updatedAt: new Date() };

function makeReq(body?: unknown) {
  return new Request("http://localhost/api/config/source", {
    method: "PUT",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.mocked(readConfig).mockReset();
  vi.mocked(writeConfig).mockReset();
});

describe("GET /api/config/[group]", () => {
  it("returns records for the given group", async () => {
    vi.mocked(readConfig).mockResolvedValueOnce([fakeRecord]);
    const req = makeReq();
    const res = await GET(req as Parameters<typeof GET>[0], { params: Promise.resolve({ group: "source" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(readConfig).toHaveBeenCalledWith("source");
  });

  it("returns 500 on error", async () => {
    vi.mocked(readConfig).mockRejectedValueOnce(new Error("fail"));
    const req = makeReq();
    const res = await GET(req as Parameters<typeof GET>[0], { params: Promise.resolve({ group: "llm" }) });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("fail");
  });
});

describe("PUT /api/config/[group]", () => {
  it("writes config with the group from params", async () => {
    vi.mocked(writeConfig).mockResolvedValueOnce();
    const req = makeReq([{ key: "LOKI_URL", value: "http://loki" }]);
    const res = await PUT(req as Parameters<typeof PUT>[0], { params: Promise.resolve({ group: "source" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(writeConfig).toHaveBeenCalledWith([{ key: "LOKI_URL", value: "http://loki", group: "source" }]);
  });

  it("returns 500 on write error", async () => {
    vi.mocked(writeConfig).mockRejectedValueOnce(new Error("write fail"));
    const req = makeReq([]);
    const res = await PUT(req as Parameters<typeof PUT>[0], { params: Promise.resolve({ group: "llm" }) });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("write fail");
  });
});
