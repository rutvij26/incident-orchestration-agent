import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsBar } from "./StatsBar";

const baseStats = { totalIncidents: 5, openIssues: 3, fixesAttempted: 2, lastScan: null, lastScanStatus: null };

describe("StatsBar", () => {
  it("renders all four stat cards", () => {
    render(<StatsBar stats={baseStats} />);
    expect(screen.getByText("Total Incidents")).toBeInTheDocument();
    expect(screen.getByText("Open Issues")).toBeInTheDocument();
    expect(screen.getByText("Fixes Attempted")).toBeInTheDocument();
    expect(screen.getByText("Last Scan")).toBeInTheDocument();
  });

  it("displays correct numeric values", () => {
    render(<StatsBar stats={baseStats} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows 'Never' when lastScan is null", () => {
    render(<StatsBar stats={{ ...baseStats, lastScan: null }} />);
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  describe("formatRelativeTime", () => {
    beforeAll(() => vi.useFakeTimers());
    afterAll(() => vi.useRealTimers());

    it("shows 'Just now' for scans less than 1 minute ago", () => {
      vi.setSystemTime(new Date("2024-06-01T12:00:30Z"));
      render(<StatsBar stats={{ ...baseStats, lastScan: "2024-06-01T12:00:00Z" }} />);
      expect(screen.getByText("Just now")).toBeInTheDocument();
    });

    it("shows minutes ago for scans less than 1 hour ago", () => {
      vi.setSystemTime(new Date("2024-06-01T12:30:00Z"));
      render(<StatsBar stats={{ ...baseStats, lastScan: "2024-06-01T12:00:00Z" }} />);
      expect(screen.getByText("30m ago")).toBeInTheDocument();
    });

    it("shows hours ago for scans less than 24 hours ago", () => {
      vi.setSystemTime(new Date("2024-06-01T17:00:00Z"));
      render(<StatsBar stats={{ ...baseStats, lastScan: "2024-06-01T12:00:00Z" }} />);
      expect(screen.getByText("5h ago")).toBeInTheDocument();
    });

    it("shows days ago for scans 24+ hours ago", () => {
      vi.setSystemTime(new Date("2024-06-03T12:00:00Z"));
      render(<StatsBar stats={{ ...baseStats, lastScan: "2024-06-01T12:00:00Z" }} />);
      expect(screen.getByText("2d ago")).toBeInTheDocument();
    });
  });
});
