import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/config", () => ({ isConfigured: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import RootPage from "./page";
import { isConfigured } from "@/lib/config";
import { redirect } from "next/navigation";

beforeEach(() => {
  vi.mocked(isConfigured).mockReset();
  vi.mocked(redirect).mockReset();
});

describe("RootPage", () => {
  it("redirects to /overview when configured", async () => {
    vi.mocked(isConfigured).mockResolvedValueOnce(true);
    await RootPage();
    expect(redirect).toHaveBeenCalledWith("/overview");
  });

  it("redirects to /setup when not configured", async () => {
    vi.mocked(isConfigured).mockResolvedValueOnce(false);
    await RootPage();
    expect(redirect).toHaveBeenCalledWith("/setup");
  });

  it("redirects to /setup when isConfigured throws (DB not ready)", async () => {
    vi.mocked(isConfigured).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await RootPage();
    expect(redirect).toHaveBeenCalledWith("/setup");
  });
});
