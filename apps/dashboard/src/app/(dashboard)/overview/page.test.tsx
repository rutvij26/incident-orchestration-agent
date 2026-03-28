import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockFetch = vi.fn();
beforeEach(() => { global.fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/overview",
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import OverviewPage from "./page";

const emptyStats = { totalIncidents: 0, openIssues: 0, fixesAttempted: 0, lastScan: null, lastScanStatus: null };

describe("OverviewPage", () => {
  it("renders overview with data from APIs", async () => {
    mockFetch
      .mockResolvedValueOnce({ json: async () => emptyStats })          // stats
      .mockResolvedValueOnce({ json: async () => [] })                   // incidents
      .mockResolvedValueOnce({ json: async () => [] })                   // prs
      .mockResolvedValueOnce({ json: async () => null });                // agent

    const element = await OverviewPage();
    render(element);

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Total Incidents")).toBeInTheDocument();
    expect(screen.getByText("No incidents yet.")).toBeInTheDocument();
    expect(screen.getByText("No PRs created yet.")).toBeInTheDocument();
    expect(screen.getByText("No runs yet.")).toBeInTheDocument();
  });

  it("uses NEXT_PUBLIC_BASE_URL env var for fetch base URL", async () => {
    process.env.NEXT_PUBLIC_BASE_URL = "http://myhost:3000";
    mockFetch
      .mockResolvedValueOnce({ json: async () => emptyStats })
      .mockResolvedValueOnce({ json: async () => [] })
      .mockResolvedValueOnce({ json: async () => [] })
      .mockResolvedValueOnce({ json: async () => null });

    await OverviewPage();
    expect(mockFetch).toHaveBeenCalledWith("http://myhost:3000/api/overview/stats", expect.anything());
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });
});
