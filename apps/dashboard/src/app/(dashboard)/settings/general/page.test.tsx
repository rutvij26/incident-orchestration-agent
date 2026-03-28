import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/config", () => ({ readConfig: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import GeneralPage from "./page";
import { readConfig } from "@/lib/config";

beforeEach(() => vi.mocked(readConfig).mockReset());

describe("GeneralPage", () => {
  it("renders GeneralSettings with values from config", async () => {
    vi.mocked(readConfig).mockResolvedValueOnce([
      { key: "SOURCE_CONNECTORS", value: "loki", encrypted: false, groupName: "source", updatedAt: new Date() },
      { key: "AUTO_ESCALATE_FROM", value: "critical", encrypted: false, groupName: "source", updatedAt: new Date() },
    ]);
    const element = await GeneralPage();
    render(element);
    expect(screen.getByDisplayValue("loki")).toBeInTheDocument();
  });

  it("renders with empty values when config is empty", async () => {
    vi.mocked(readConfig).mockResolvedValueOnce([]);
    const element = await GeneralPage();
    render(element);
    expect(screen.getByDisplayValue("loki")).toBeInTheDocument(); // default value
  });
});
