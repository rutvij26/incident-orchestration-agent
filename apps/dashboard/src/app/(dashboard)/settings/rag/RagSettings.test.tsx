import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RagSettings } from "./RagSettings";

const mockFetch = vi.fn();
beforeEach(() => { global.fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

const defaultProps = { initialRepoUrl: "https://github.com/org/repo", initialTopK: "6", initialMinScore: "0.2", initialChunkSize: "900" };

describe("RagSettings", () => {
  it("renders with initial values", () => {
    render(<RagSettings {...defaultProps} />);
    expect(screen.getByDisplayValue("https://github.com/org/repo")).toBeInTheDocument();
    expect(screen.getByDisplayValue("6")).toBeInTheDocument();
    expect(screen.getByDisplayValue("0.2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("900")).toBeInTheDocument();
  });

  it("defaults top-k, min-score, chunk-size when initial values are empty", () => {
    render(<RagSettings initialRepoUrl="" initialTopK="" initialMinScore="" initialChunkSize="" />);
    expect(screen.getByDisplayValue("6")).toBeInTheDocument();
    expect(screen.getByDisplayValue("0.2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("900")).toBeInTheDocument();
  });

  it("updates repo URL on input change", () => {
    render(<RagSettings {...defaultProps} />);
    const input = screen.getByDisplayValue("https://github.com/org/repo");
    fireEvent.change(input, { target: { value: "https://github.com/new/repo" } });
    expect(screen.getByDisplayValue("https://github.com/new/repo")).toBeInTheDocument();
  });

  it("updates Top K value", () => {
    render(<RagSettings {...defaultProps} />);
    const topKInput = screen.getByDisplayValue("6");
    fireEvent.change(topKInput, { target: { value: "10" } });
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();
  });

  it("updates Min Score value", () => {
    render(<RagSettings {...defaultProps} />);
    const minScoreInput = screen.getByDisplayValue("0.2");
    fireEvent.change(minScoreInput, { target: { value: "0.5" } });
    expect(screen.getByDisplayValue("0.5")).toBeInTheDocument();
  });

  it("updates Chunk Size value", () => {
    render(<RagSettings {...defaultProps} />);
    const chunkInput = screen.getByDisplayValue("900");
    fireEvent.change(chunkInput, { target: { value: "1200" } });
    expect(screen.getByDisplayValue("1200")).toBeInTheDocument();
  });

  it("saves correct values", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<RagSettings {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toContainEqual({ key: "REPO_URL", value: "https://github.com/org/repo" });
      expect(body).toContainEqual({ key: "RAG_TOP_K", value: "6" });
    });
  });
});
