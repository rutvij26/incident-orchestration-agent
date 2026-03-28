import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/config", () => ({ readConfig: vi.fn() }));

import AutofixPage from "./page";
import { readConfig } from "@/lib/config";

beforeEach(() => vi.mocked(readConfig).mockReset());

describe("AutofixPage", () => {
  it("renders AutofixSettings with values from config", async () => {
    vi.mocked(readConfig).mockResolvedValueOnce([
      { key: "AUTO_FIX_MODE", value: "pr", encrypted: false, groupName: "autofix", updatedAt: new Date() },
      { key: "AUTO_FIX_SEVERITY", value: "high", encrypted: false, groupName: "autofix", updatedAt: new Date() },
      { key: "AUTO_FIX_BRANCH_PREFIX", value: "fix/", encrypted: false, groupName: "autofix", updatedAt: new Date() },
      { key: "AUTO_FIX_TEST_COMMAND", value: "yarn test", encrypted: false, groupName: "autofix", updatedAt: new Date() },
    ]);
    const element = await AutofixPage();
    render(element);
    expect(screen.getByDisplayValue("fix/")).toBeInTheDocument();
    expect(screen.getByDisplayValue("yarn test")).toBeInTheDocument();
  });

  it("renders with defaults when config is empty", async () => {
    vi.mocked(readConfig).mockResolvedValueOnce([]);
    const element = await AutofixPage();
    render(element);
    expect(screen.getByDisplayValue("autofix/")).toBeInTheDocument();
  });
});
