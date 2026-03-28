import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsForm } from "./SettingsForm";

const mockFetch = vi.fn();
beforeEach(() => { global.fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

describe("SettingsForm", () => {
  const getValues = vi.fn(() => [{ key: "LOKI_URL", value: "http://loki:3100" }]);

  it("renders children and save button", () => {
    render(
      <SettingsForm group="source" getValues={getValues}>
        <div>Child content</div>
      </SettingsForm>
    );
    expect(screen.getByText("Child content")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("calls PUT /api/config/source with values on save", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(
      <SettingsForm group="source" getValues={getValues}>
        <div />
      </SettingsForm>
    );
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith(
      "/api/config/source",
      expect.objectContaining({ method: "PUT" })
    ));
  });

  it("shows 'Saved' feedback after successful save", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(
      <SettingsForm group="llm" getValues={getValues}>
        <div />
      </SettingsForm>
    );
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeInTheDocument());
  });

  it("disables the button while saving", async () => {
    let resolve: () => void;
    mockFetch.mockReturnValueOnce(new Promise((r) => { resolve = r as () => void; }));
    render(
      <SettingsForm group="source" getValues={getValues}>
        <div />
      </SettingsForm>
    );
    const button = screen.getByRole("button", { name: /save changes/i });
    fireEvent.click(button);
    expect(button).toBeDisabled();
    resolve!();
    await waitFor(() => expect(button).not.toBeDisabled());
  });
});
