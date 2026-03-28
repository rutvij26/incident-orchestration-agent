import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TestConnectionBtn } from "./TestConnectionBtn";

const mockFetch = vi.fn();
beforeEach(() => { global.fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

describe("TestConnectionBtn", () => {
  it("renders the button", () => {
    render(<TestConnectionBtn configKey="ANTHROPIC_API_KEY" getValue={() => ""} />);
    expect(screen.getByRole("button", { name: /test connection/i })).toBeInTheDocument();
  });

  it("shows 'Enter a value first' when value is empty", async () => {
    render(<TestConnectionBtn configKey="ANTHROPIC_API_KEY" getValue={() => ""} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText(/enter a value first/i)).toBeInTheDocument());
  });

  it("shows 'Connected' on successful validation", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ ok: true, message: "Connected" }),
    });
    render(<TestConnectionBtn configKey="ANTHROPIC_API_KEY" getValue={() => "sk-ant-test"} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Connected")).toBeInTheDocument());
  });

  it("shows error message on failed validation", async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ ok: false, message: "HTTP 401" }),
    });
    render(<TestConnectionBtn configKey="ANTHROPIC_API_KEY" getValue={() => "bad-key"} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("HTTP 401")).toBeInTheDocument());
  });

  it("shows error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    render(<TestConnectionBtn configKey="GITHUB_TOKEN" getValue={() => "ghp_abc"} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText(/network error/i)).toBeInTheDocument());
  });

  it("disables the button while loading", async () => {
    let resolvePromise: (v: unknown) => void;
    mockFetch.mockReturnValueOnce(new Promise((resolve) => { resolvePromise = resolve; }));

    render(<TestConnectionBtn configKey="GITHUB_TOKEN" getValue={() => "ghp_abc"} />);
    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(button).toBeDisabled();
    resolvePromise!({ json: async () => ({ ok: true, message: "Connected" }) });
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
