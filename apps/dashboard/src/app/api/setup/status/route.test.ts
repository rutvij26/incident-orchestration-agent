import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/config", () => ({ isConfigured: vi.fn() }));

import { GET } from "./route";
import { isConfigured } from "@/lib/config";

beforeEach(() => vi.mocked(isConfigured).mockReset());

describe("GET /api/setup/status", () => {
  it("returns configured: true when agent is configured", async () => {
    vi.mocked(isConfigured).mockResolvedValueOnce(true);
    const res = await GET();
    const data = await res.json();
    expect(data).toEqual({ configured: true });
  });

  it("returns configured: false when agent is not configured", async () => {
    vi.mocked(isConfigured).mockResolvedValueOnce(false);
    const res = await GET();
    const data = await res.json();
    expect(data).toEqual({ configured: false });
  });

  it("returns configured: false when DB is unreachable", async () => {
    vi.mocked(isConfigured).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await GET();
    const data = await res.json();
    expect(data).toEqual({ configured: false });
  });
});
