import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/config", () => ({ readConfig: vi.fn() }));

import RagPage from "./page";
import { readConfig } from "@/lib/config";

beforeEach(() => vi.mocked(readConfig).mockReset());

describe("RagPage", () => {
  it("renders RagSettings with values from config", async () => {
    vi.mocked(readConfig).mockResolvedValueOnce([
      { key: "REPO_URL", value: "https://github.com/org/repo", encrypted: false, groupName: "rag", updatedAt: new Date() },
      { key: "RAG_TOP_K", value: "8", encrypted: false, groupName: "rag", updatedAt: new Date() },
    ]);
    const element = await RagPage();
    render(element);
    expect(screen.getByDisplayValue("https://github.com/org/repo")).toBeInTheDocument();
    expect(screen.getByDisplayValue("8")).toBeInTheDocument();
  });

  it("renders with defaults when config is empty", async () => {
    vi.mocked(readConfig).mockResolvedValueOnce([]);
    const element = await RagPage();
    render(element);
    expect(screen.getByDisplayValue("6")).toBeInTheDocument(); // default top-k
  });
});
