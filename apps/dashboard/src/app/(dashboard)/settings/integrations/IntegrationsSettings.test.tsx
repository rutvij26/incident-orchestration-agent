import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { IntegrationsSettings } from "./IntegrationsSettings";

const mockFetch = vi.fn();
beforeEach(() => { global.fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

const defaultProps = {
  initialAnthropicKey: "sk-ant",
  initialAnthropicModel: "claude-sonnet-4-5",
  initialOpenaiKey: "",
  initialOpenaiModel: "",
  initialGeminiKey: "",
  initialGeminiModel: "",
  initialGithubToken: "ghp_abc",
  initialGithubOwner: "myorg",
  initialGithubRepo: "myrepo",
};

describe("IntegrationsSettings", () => {
  it("renders Anthropic, OpenAI, and GitHub sections", () => {
    render(<IntegrationsSettings {...defaultProps} />);
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("GitHub")).toBeInTheDocument();
  });

  it("defaults OpenAI model to gpt-4o-mini when empty", () => {
    render(<IntegrationsSettings {...defaultProps} initialOpenaiModel="" />);
    expect(screen.getByDisplayValue("gpt-4o-mini")).toBeInTheDocument();
  });

  it("defaults Gemini model to gemini-1.5-flash when empty", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<IntegrationsSettings {...defaultProps} initialGeminiModel="" />);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const geminiModel = body.find((r: { key: string }) => r.key === "GEMINI_MODEL");
      expect(geminiModel?.value).toBe("gemini-1.5-flash");
    });
  });

  it("defaults Anthropic model to claude-sonnet-4-5 when empty", () => {
    render(<IntegrationsSettings {...defaultProps} initialAnthropicModel="" />);
    expect(screen.getByDisplayValue("claude-sonnet-4-5")).toBeInTheDocument();
  });

  it("updates GitHub owner on input change", () => {
    render(<IntegrationsSettings {...defaultProps} />);
    const ownerInput = screen.getByDisplayValue("myorg");
    fireEvent.change(ownerInput, { target: { value: "neworg" } });
    expect(screen.getByDisplayValue("neworg")).toBeInTheDocument();
  });

  it("updates Anthropic model on input change", () => {
    render(<IntegrationsSettings {...defaultProps} />);
    const modelInput = screen.getByDisplayValue("claude-sonnet-4-5");
    fireEvent.change(modelInput, { target: { value: "claude-opus-4-5" } });
    expect(screen.getByDisplayValue("claude-opus-4-5")).toBeInTheDocument();
  });

  it("updates OpenAI model on input change", () => {
    render(<IntegrationsSettings {...defaultProps} initialOpenaiModel="gpt-4o" />);
    const modelInput = screen.getByDisplayValue("gpt-4o");
    fireEvent.change(modelInput, { target: { value: "gpt-4o-mini" } });
    expect(screen.getByDisplayValue("gpt-4o-mini")).toBeInTheDocument();
  });

  it("updates GitHub repo on input change", () => {
    render(<IntegrationsSettings {...defaultProps} />);
    const repoInput = screen.getByDisplayValue("myrepo");
    fireEvent.change(repoInput, { target: { value: "newrepo" } });
    expect(screen.getByDisplayValue("newrepo")).toBeInTheDocument();
  });

  it("test connection button calls getValue for each provider (empty key shows error)", () => {
    render(<IntegrationsSettings
      {...defaultProps}
      initialAnthropicKey=""
      initialOpenaiKey=""
      initialGithubToken=""
    />);
    const btns = screen.getAllByRole("button", { name: /test connection/i });
    fireEvent.click(btns[0]); // Anthropic → empty → getValue() called
    fireEvent.click(btns[1]); // OpenAI → empty → getValue() called
    fireEvent.click(btns[2]); // GitHub → empty → getValue() called
    expect(screen.getAllByText("Enter a value first").length).toBeGreaterThan(0);
  });

  it("saves with all integration keys", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<IntegrationsSettings {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toContainEqual(expect.objectContaining({ key: "ANTHROPIC_API_KEY" }));
      expect(body).toContainEqual(expect.objectContaining({ key: "GITHUB_TOKEN" }));
    });
  });
});
