import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecentPRs } from "./RecentPRs";

const makePR = (overrides = {}) => ({
  id: "pr-1",
  incident_id: "inc-1",
  pr_url: "https://github.com/owner/repo/pull/1",
  outcome: "success",
  tests_passed: true,
  plan_summary: "Fix the DB connection leak",
  created_at: "2024-01-15T10:00:00Z",
  ...overrides,
});

describe("RecentPRs", () => {
  it("shows 'No PRs created yet' when list is empty", () => {
    render(<RecentPRs prs={[]} />);
    expect(screen.getByText("No PRs created yet.")).toBeInTheDocument();
  });

  it("renders PR link with plan_summary as text", () => {
    render(<RecentPRs prs={[makePR()]} />);
    const link = screen.getByRole("link", { name: "Fix the DB connection leak" });
    expect(link).toHaveAttribute("href", "https://github.com/owner/repo/pull/1");
  });

  it("falls back to pr_url as link text when plan_summary is null", () => {
    render(<RecentPRs prs={[makePR({ plan_summary: null })]} />);
    const link = screen.getByRole("link", { name: "https://github.com/owner/repo/pull/1" });
    expect(link).toBeInTheDocument();
  });

  it("shows 'tests passed' badge when tests_passed is true", () => {
    render(<RecentPRs prs={[makePR({ tests_passed: true })]} />);
    expect(screen.getByText("tests passed")).toBeInTheDocument();
  });

  it("shows 'tests failed' badge when tests_passed is false", () => {
    render(<RecentPRs prs={[makePR({ tests_passed: false })]} />);
    expect(screen.getByText("tests failed")).toBeInTheDocument();
  });

  it("hides date when created_at is null", () => {
    render(<RecentPRs prs={[makePR({ created_at: null })]} />);
    // No date text rendered
    expect(screen.queryByText(/2024/)).toBeNull();
  });

  it("shows date when created_at is set", () => {
    render(<RecentPRs prs={[makePR({ created_at: "2024-01-15T10:00:00Z" })]} />);
    expect(screen.getByText(/2024/)).toBeInTheDocument();
  });

  it("renders multiple PRs", () => {
    render(
      <RecentPRs
        prs={[
          makePR({ id: "pr-1", plan_summary: "Fix A" }),
          makePR({ id: "pr-2", plan_summary: "Fix B" }),
        ]}
      />
    );
    expect(screen.getByText("Fix A")).toBeInTheDocument();
    expect(screen.getByText("Fix B")).toBeInTheDocument();
  });
});
