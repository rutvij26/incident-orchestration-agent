import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GeneralSettings } from "./GeneralSettings";

const mockFetch = vi.fn();
beforeEach(() => { global.fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

describe("GeneralSettings", () => {
  it("renders with initial values", () => {
    render(<GeneralSettings initialSourceConnectors="loki" initialEscalateFrom="high" />);
    expect(screen.getByDisplayValue("loki")).toBeInTheDocument();
  });

  it("defaults to 'loki' and 'high' when initial values are empty", () => {
    render(<GeneralSettings initialSourceConnectors="" initialEscalateFrom="" />);
    expect(screen.getByDisplayValue("loki")).toBeInTheDocument();
  });

  it("updates source connectors on input change", () => {
    render(<GeneralSettings initialSourceConnectors="loki" initialEscalateFrom="high" />);
    const input = screen.getByDisplayValue("loki");
    fireEvent.change(input, { target: { value: "loki,cloudwatch" } });
    expect(screen.getByDisplayValue("loki,cloudwatch")).toBeInTheDocument();
  });

  it("saves with correct values", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<GeneralSettings initialSourceConnectors="loki" initialEscalateFrom="high" />);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toContainEqual({ key: "SOURCE_CONNECTORS", value: "loki" });
      expect(body).toContainEqual({ key: "AUTO_ESCALATE_FROM", value: "high" });
    });
  });
});
