import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SetupWizard } from "./SetupWizard";

const mockPush = vi.fn();
const mockFetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

beforeEach(() => {
  global.fetch = mockFetch;
  mockFetch.mockReset();
  mockPush.mockReset();
});

describe("SetupWizard", () => {
  it("renders step 1 (LLM Provider) initially", () => {
    render(<SetupWizard />);
    expect(screen.getAllByText("LLM Provider").length).toBeGreaterThan(0);
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
  });

  it("Back button is disabled on step 0", () => {
    render(<SetupWizard />);
    expect(screen.getByRole("button", { name: /back/i })).toBeDisabled();
  });

  it("navigates to step 2 on Next click", () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getAllByText("GitHub").length).toBeGreaterThan(0);
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
  });

  it("navigates back from step 2 to step 1", () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.getAllByText("LLM Provider").length).toBeGreaterThan(0);
  });

  it("navigates through all 4 steps", () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // step 2
    expect(screen.getAllByText("GitHub").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // step 3
    expect(screen.getByText("Loki Log Source")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // step 4
    expect(screen.getByText("RAG Repository")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /finish setup/i })).toBeInTheDocument();
  });

  it("selects openai provider and updates key field", () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByText("openai"));
    // Input placeholder changes based on provider — still renders
    expect(screen.getByText("openai").closest("button")).toHaveClass("border-indigo-500");
  });

  it("selects gemini provider", () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByText("gemini"));
    expect(screen.getByText("gemini").closest("button")).toHaveClass("border-indigo-500");
  });

  it("selects anthropic provider (default)", () => {
    render(<SetupWizard />);
    // anthropic is selected by default
    expect(screen.getByText("anthropic").closest("button")).toHaveClass("border-indigo-500");
  });

  it("submits config on Finish setup and redirects to /overview", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<SetupWizard />);

    // Navigate to final step
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: /next/i }));

    fireEvent.click(screen.getByRole("button", { name: /finish setup/i }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      "/api/config",
      expect.objectContaining({ method: "PUT" })
    ));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/overview"));
  });

  it("includes REPO_URL in request only when repoUrl is set", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<SetupWizard />);

    // Navigate to step 4 (RAG)
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // Fill in repo URL
    const input = screen.getByPlaceholderText("https://github.com/owner/repo");
    fireEvent.change(input, { target: { value: "https://github.com/myorg/myrepo" } });

    fireEvent.click(screen.getByRole("button", { name: /finish setup/i }));
    await waitFor(() => {
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const repoUrlRecord = body.find((r: { key: string }) => r.key === "REPO_URL");
      expect(repoUrlRecord).toBeDefined();
      expect(repoUrlRecord.value).toBe("https://github.com/myorg/myrepo");
    });
  });

  it("disables Finish button while saving", async () => {
    let resolve: () => void;
    mockFetch.mockReturnValueOnce(new Promise((r) => { resolve = r as () => void; }));
    render(<SetupWizard />);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole("button", { name: /next/i }));

    const finishBtn = screen.getByRole("button", { name: /finish setup/i });
    fireEvent.click(finishBtn);
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    resolve!();
  });

  it("updates GitHub fields on step 2", () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // go to GitHub step
    fireEvent.change(screen.getByPlaceholderText("your-org"), { target: { value: "myorg" } });
    fireEvent.change(screen.getByPlaceholderText("your-repo"), { target: { value: "myrepo" } });
    expect(screen.getByDisplayValue("myorg")).toBeInTheDocument();
    expect(screen.getByDisplayValue("myrepo")).toBeInTheDocument();
  });

  it("updates Loki URL on step 3", () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    const lokiInput = screen.getByDisplayValue("http://loki:3100");
    fireEvent.change(lokiInput, { target: { value: "http://myloki:3100" } });
    expect(screen.getByDisplayValue("http://myloki:3100")).toBeInTheDocument();
  });

  it("updates anthropic API key on input change (default provider)", () => {
    const { container } = render(<SetupWizard />);
    const input = container.querySelector("input[type='password']") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-ant-new" } });
    expect(input.value).toBe("sk-ant-new");
  });

  it("updates openai API key on input change", () => {
    const { container } = render(<SetupWizard />);
    fireEvent.click(screen.getByText("openai"));
    const input = container.querySelector("input[type='password']") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-openai-new" } });
    expect(input.value).toBe("sk-openai-new");
  });

  it("updates gemini API key on input change", () => {
    const { container } = render(<SetupWizard />);
    fireEvent.click(screen.getByText("gemini"));
    const input = container.querySelector("input[type='password']") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-gemini-new" } });
    expect(input.value).toBe("sk-gemini-new");
  });

  it("test connection getValue on step 0 (empty key shows error)", () => {
    render(<SetupWizard />);
    // anthropicKey is empty by default — clicking test triggers getValue() → empty → error
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));
    expect(screen.getByText("Enter a value first")).toBeInTheDocument();
  });

  it("updates GitHub token MaskedInput on step 2", () => {
    const { container } = render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // go to GitHub step
    const tokenInput = container.querySelector("input[type='password']") as HTMLInputElement;
    fireEvent.change(tokenInput, { target: { value: "ghp_new" } });
    expect(tokenInput.value).toBe("ghp_new");
  });

  it("test connection getValue on step 2 Loki (non-empty default covers getValue)", () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // step 2 GitHub
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // step 3 Loki
    // loki url is non-empty (http://loki:3100), clicking test connection calls getValue
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));
    // getValue was called — fetch was triggered (or validation step)
    expect(mockFetch).toHaveBeenCalled();
  });

  it("test connection getValue on GitHub step (empty token shows error)", () => {
    render(<SetupWizard />);
    fireEvent.click(screen.getByRole("button", { name: /next/i })); // GitHub step
    // githubToken is empty by default
    fireEvent.click(screen.getByRole("button", { name: /test connection/i }));
    expect(screen.getByText("Enter a value first")).toBeInTheDocument();
  });
});
