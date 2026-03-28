import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/config", () => ({ readConfig: vi.fn() }));

import IntegrationsPage from "./page";
import { readConfig } from "@/lib/config";

beforeEach(() => vi.mocked(readConfig).mockReset());

describe("IntegrationsPage", () => {
  it("renders IntegrationsSettings with values from config", async () => {
    vi.mocked(readConfig)
      .mockResolvedValueOnce([
        { key: "ANTHROPIC_API_KEY", value: "sk-ant", encrypted: true, groupName: "llm", updatedAt: new Date() },
        { key: "ANTHROPIC_MODEL", value: "claude-sonnet-4-5", encrypted: false, groupName: "llm", updatedAt: new Date() },
      ])
      .mockResolvedValueOnce([
        { key: "GITHUB_TOKEN", value: "ghp_abc", encrypted: true, groupName: "github", updatedAt: new Date() },
        { key: "GITHUB_OWNER", value: "myorg", encrypted: false, groupName: "github", updatedAt: new Date() },
        { key: "GITHUB_REPO", value: "myrepo", encrypted: false, groupName: "github", updatedAt: new Date() },
      ]);
    const element = await IntegrationsPage();
    render(element);
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
  });

  it("renders with empty configs", async () => {
    vi.mocked(readConfig).mockResolvedValue([]);
    const element = await IntegrationsPage();
    render(element);
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });
});
