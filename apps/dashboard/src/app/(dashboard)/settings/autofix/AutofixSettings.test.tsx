import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AutofixSettings } from "./AutofixSettings";

const mockFetch = vi.fn();
beforeEach(() => { global.fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

const defaultProps = { initialMode: "off", initialSeverity: "high", initialBranchPrefix: "autofix/", initialTestCommand: "npm test" };

describe("AutofixSettings", () => {
  it("renders with initial values", () => {
    render(<AutofixSettings {...defaultProps} />);
    expect(screen.getByDisplayValue("autofix/")).toBeInTheDocument();
    expect(screen.getByDisplayValue("npm test")).toBeInTheDocument();
  });

  it("defaults to 'off', 'high', 'autofix/', 'npm test' when initial values are empty", () => {
    render(<AutofixSettings initialMode="" initialSeverity="" initialBranchPrefix="" initialTestCommand="" />);
    expect(screen.getByDisplayValue("autofix/")).toBeInTheDocument();
    expect(screen.getByDisplayValue("npm test")).toBeInTheDocument();
  });

  it("updates branch prefix on input change", () => {
    render(<AutofixSettings {...defaultProps} />);
    const input = screen.getByDisplayValue("autofix/");
    fireEvent.change(input, { target: { value: "fix/" } });
    expect(screen.getByDisplayValue("fix/")).toBeInTheDocument();
  });

  it("updates test command on input change", () => {
    render(<AutofixSettings {...defaultProps} />);
    const input = screen.getByDisplayValue("npm test");
    fireEvent.change(input, { target: { value: "yarn test" } });
    expect(screen.getByDisplayValue("yarn test")).toBeInTheDocument();
  });

  it("saves with correct values", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<AutofixSettings {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toContainEqual({ key: "AUTO_FIX_MODE", value: "off" });
      expect(body).toContainEqual({ key: "AUTO_FIX_BRANCH_PREFIX", value: "autofix/" });
    });
  });
});
