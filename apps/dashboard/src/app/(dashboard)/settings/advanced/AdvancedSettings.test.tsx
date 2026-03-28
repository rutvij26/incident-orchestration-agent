import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdvancedSettings } from "./AdvancedSettings";

const mockFetch = vi.fn();
beforeEach(() => { global.fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

describe("AdvancedSettings", () => {
  it("renders Temporal address as read-only", () => {
    render(<AdvancedSettings temporalAddress="temporal:7233" initialOtelEndpoint="" />);
    const input = screen.getByDisplayValue("temporal:7233");
    expect(input).toBeDisabled();
  });

  it("renders OTLP endpoint input with initial value", () => {
    render(<AdvancedSettings temporalAddress="localhost:7233" initialOtelEndpoint="http://otel:4318" />);
    expect(screen.getByDisplayValue("http://otel:4318")).toBeInTheDocument();
  });

  it("updates OTLP endpoint on input change", () => {
    render(<AdvancedSettings temporalAddress="localhost:7233" initialOtelEndpoint="" />);
    const input = screen.getByPlaceholderText("http://otel-collector:4318");
    fireEvent.change(input, { target: { value: "http://my-otel:4318" } });
    expect(screen.getByDisplayValue("http://my-otel:4318")).toBeInTheDocument();
  });

  it("saves OTLP endpoint value", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    render(<AdvancedSettings temporalAddress="localhost:7233" initialOtelEndpoint="http://otel:4318" />);
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => {
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toContainEqual({ key: "OTEL_EXPORTER_OTLP_ENDPOINT", value: "http://otel:4318" });
    });
  });
});
