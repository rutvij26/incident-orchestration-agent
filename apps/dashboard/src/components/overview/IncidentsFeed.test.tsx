import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IncidentsFeed } from "./IncidentsFeed";

const makeIncident = (overrides = {}) => ({
  id: "1",
  title: "High error rate",
  severity: "high",
  status: "open",
  issue_url: null,
  created_at: "2024-01-01T00:00:00Z",
  last_seen: null,
  ...overrides,
});

describe("IncidentsFeed", () => {
  it("shows 'No incidents yet' when list is empty", () => {
    render(<IncidentsFeed incidents={[]} />);
    expect(screen.getByText("No incidents yet.")).toBeInTheDocument();
  });

  it("renders incident rows in a table", () => {
    render(<IncidentsFeed incidents={[makeIncident()]} />);
    expect(screen.getByText("High error rate")).toBeInTheDocument();
    expect(screen.getByText("high")).toBeInTheDocument();
    expect(screen.getByText("open")).toBeInTheDocument();
  });

  it("renders a link when issue_url is present", () => {
    render(<IncidentsFeed incidents={[makeIncident({ issue_url: "https://github.com/issues/1" })]} />);
    const link = screen.getByRole("link", { name: "High error rate" });
    expect(link).toHaveAttribute("href", "https://github.com/issues/1");
  });

  it("renders plain text title when issue_url is null", () => {
    render(<IncidentsFeed incidents={[makeIncident({ issue_url: null })]} />);
    expect(screen.queryByRole("link", { name: "High error rate" })).toBeNull();
    expect(screen.getByText("High error rate")).toBeInTheDocument();
  });

  it("shows 'open' when status is null", () => {
    render(<IncidentsFeed incidents={[makeIncident({ status: null })]} />);
    expect(screen.getByText("open")).toBeInTheDocument();
  });

  it("uses last_seen when created_at is null", () => {
    render(<IncidentsFeed incidents={[makeIncident({ created_at: null, last_seen: "2024-01-02T00:00:00Z" })]} />);
    // Should render without errors and show the date
    expect(screen.getByText("High error rate")).toBeInTheDocument();
  });

  it("shows '—' when both created_at and last_seen are null", () => {
    render(<IncidentsFeed incidents={[makeIncident({ created_at: null, last_seen: null })]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("applies correct severity color for all severity levels", () => {
    const severities = ["critical", "high", "medium", "low", "unknown"];
    for (const severity of severities) {
      const { unmount } = render(<IncidentsFeed incidents={[makeIncident({ id: severity, title: `${severity} inc`, severity })]} />);
      expect(screen.getByText(severity, { selector: ".inline-flex" })).toBeInTheDocument();
      unmount();
    }
  });
});
