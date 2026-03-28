import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/config", () => ({ readConfig: vi.fn() }));

import AdvancedPage from "./page";
import { readConfig } from "@/lib/config";

beforeEach(() => {
  vi.mocked(readConfig).mockReset();
  delete process.env.TEMPORAL_ADDRESS;
  delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
});

describe("AdvancedPage", () => {
  it("renders AdvancedSettings with values from config", async () => {
    vi.mocked(readConfig).mockResolvedValueOnce([
      { key: "TEMPORAL_ADDRESS", value: "temporal:7233", encrypted: false, groupName: "bootstrap", updatedAt: new Date() },
      { key: "OTEL_EXPORTER_OTLP_ENDPOINT", value: "http://otel:4318", encrypted: false, groupName: "bootstrap", updatedAt: new Date() },
    ]);
    const element = await AdvancedPage();
    render(element);
    expect(screen.getByDisplayValue("temporal:7233")).toBeInTheDocument();
    expect(screen.getByDisplayValue("http://otel:4318")).toBeInTheDocument();
  });

  it("falls back to TEMPORAL_ADDRESS env var", async () => {
    process.env.TEMPORAL_ADDRESS = "localhost:7233";
    vi.mocked(readConfig).mockResolvedValueOnce([]);
    const element = await AdvancedPage();
    render(element);
    expect(screen.getByDisplayValue("localhost:7233")).toBeInTheDocument();
  });

  it("falls back to OTEL_EXPORTER_OTLP_ENDPOINT env var", async () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://my-otel:4318";
    vi.mocked(readConfig).mockResolvedValueOnce([]);
    const element = await AdvancedPage();
    render(element);
    expect(screen.getByDisplayValue("http://my-otel:4318")).toBeInTheDocument();
  });

  it("defaults to localhost:7233 when no TEMPORAL_ADDRESS anywhere", async () => {
    vi.mocked(readConfig).mockResolvedValueOnce([]);
    const element = await AdvancedPage();
    render(element);
    expect(screen.getByDisplayValue("localhost:7233")).toBeInTheDocument();
  });
});
