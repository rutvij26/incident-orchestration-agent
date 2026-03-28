import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgentStatus } from "./AgentStatus";

const makeRun = (overrides = {}) => ({
  id: "run-1",
  started_at: new Date("2024-01-01T12:00:00Z").toISOString(),
  completed_at: null,
  status: "completed",
  logs_scanned: 100,
  incidents_found: 3,
  issues_opened: 2,
  fixes_attempted: 1,
  error_message: null,
  ...overrides,
});

describe("AgentStatus", () => {
  it("shows 'No runs yet' when run is null", () => {
    render(<AgentStatus run={null} />);
    expect(screen.getByText("No runs yet.")).toBeInTheDocument();
  });

  it("renders status badge and metrics", () => {
    render(<AgentStatus run={makeRun()} />);
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("applies 'running' status style", () => {
    render(<AgentStatus run={makeRun({ status: "running" })} />);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("applies 'failed' status style", () => {
    render(<AgentStatus run={makeRun({ status: "failed" })} />);
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("applies fallback style for unknown status", () => {
    render(<AgentStatus run={makeRun({ status: "pending" })} />);
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("shows error message when present", () => {
    render(<AgentStatus run={makeRun({ error_message: "Something went wrong" })} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders action slot", () => {
    render(<AgentStatus run={null} action={<button>Run now</button>} />);
    expect(screen.getByRole("button", { name: "Run now" })).toBeInTheDocument();
  });

  it("falls back to 0 for null metric values", () => {
    render(<AgentStatus run={makeRun({ logs_scanned: null, incidents_found: null, issues_opened: null, fixes_attempted: null })} />);
    // Should show 0s, not undefined
    expect(screen.getAllByText("0")).toHaveLength(4);
  });
});
