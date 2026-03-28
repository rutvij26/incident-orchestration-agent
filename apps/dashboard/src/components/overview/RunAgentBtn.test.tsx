import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { RunAgentBtn } from "./RunAgentBtn";

const mockFetch = vi.fn();
beforeEach(() => { global.fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

describe("RunAgentBtn", () => {
  it("renders 'Run now' button", () => {
    render(<RunAgentBtn />);
    expect(screen.getByRole("button", { name: /run now/i })).toBeInTheDocument();
  });

  it("shows loading state while request is in flight", async () => {
    let resolve: (v: unknown) => void;
    mockFetch.mockReturnValueOnce(new Promise((r) => { resolve = r as (v: unknown) => void; }));

    render(<RunAgentBtn />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button")).toBeDisabled();

    resolve!({ json: async () => ({ ok: true }) });
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
  });

  it("shows success message with workflowId", async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ ok: true, workflowId: "incident-orchestration-12345678" }) });
    render(<RunAgentBtn />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText(/started/i)).toBeInTheDocument());
  });

  it("shows 'Started' when ok but no workflowId", async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ ok: true }) });
    render(<RunAgentBtn />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Started")).toBeInTheDocument());
  });

  it("shows error message on failure response", async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ ok: false, error: "Temporal unavailable" }) });
    render(<RunAgentBtn />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Temporal unavailable")).toBeInTheDocument());
  });

  it("shows fallback error message when no error field", async () => {
    mockFetch.mockResolvedValueOnce({ json: async () => ({ ok: false }) });
    render(<RunAgentBtn />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Failed to start")).toBeInTheDocument());
  });

  it("shows error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network failed"));
    render(<RunAgentBtn />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText(/network failed/i)).toBeInTheDocument());
  });

  it("clears status after 4 seconds", async () => {
    vi.useFakeTimers();
    mockFetch.mockResolvedValueOnce({ json: async () => ({ ok: true }) });
    render(<RunAgentBtn />);
    fireEvent.click(screen.getByRole("button"));

    await act(async () => {
      await Promise.resolve(); // flush promise
    });

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.queryByText(/started/i)).toBeNull();
    vi.useRealTimers();
  });
});
