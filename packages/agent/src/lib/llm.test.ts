import { afterEach, describe, expect, it, vi } from "vitest";
import type { Incident } from "./types.js";

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: "not json" } }],
          }),
        },
      };
      constructor() {
        // no-op
      }
    },
  };
});

const baseEnv = { ...process.env };

afterEach(() => {
  process.env = { ...baseEnv };
  vi.resetModules();
});

const sampleIncident: Incident = {
  id: "incident-1",
  title: "Incident: error_burst (error_burst:/api/orders)",
  severity: "high",
  evidence: ["Synthetic error burst"],
  firstSeen: "2026-02-13T00:00:00Z",
  lastSeen: "2026-02-13T00:05:00Z",
  count: 5,
};

describe("llm helpers", () => {
  it("selects provider based on LLM_PROVIDER and keys", async () => {
    process.env.OPENAI_MODEL = "openai-test";
    process.env.ANTHROPIC_MODEL = "anthropic-test";
    process.env.GEMINI_MODEL = "gemini-test";

    const { __test__ } = await import("./llm.js");

    expect(__test__.resolveProvider("openai", "ok", undefined)).toEqual({
      provider: "openai",
      model: "openai-test",
    });
    expect(__test__.resolveProvider("openai", undefined, "ok")).toBeNull();
    expect(__test__.resolveProvider("anthropic", "ok", "ok")).toEqual({
      provider: "anthropic",
      model: "anthropic-test",
    });
    expect(__test__.resolveProvider("gemini", "ok", "ok", "ok")).toEqual({
      provider: "gemini",
      model: "gemini-test",
    });
    expect(__test__.resolveProvider("auto", "ok", "ok")).toEqual({
      provider: "openai",
      model: "openai-test",
    });
    expect(__test__.resolveProvider("auto", undefined, "ok")).toEqual({
      provider: "anthropic",
      model: "anthropic-test",
    });
    expect(__test__.resolveProvider("auto", undefined, undefined, "ok")).toEqual({
      provider: "gemini",
      model: "gemini-test",
    });
    expect(__test__.resolveProvider("auto", undefined, undefined)).toBeNull();
  });

  it("extracts JSON and validates schema", async () => {
    const { __test__ } = await import("./llm.js");
    const payload = {
      summary: "Error burst on /api/orders",
      root_cause: "Spike in upstream 500s",
      recommended_actions: [
        "Check upstream service health",
        "Verify recent deployments",
        "Add rate limiting for retries",
      ],
      suggested_severity: "high",
      suggested_labels: ["api", "errors"],
      confidence: 0.72,
    };

    const raw = `prefix ${JSON.stringify(payload)} suffix`;
    const json = __test__.extractJson(raw);
    const parsed = __test__.SummarySchema.parse(JSON.parse(json));

    expect(parsed.summary).toBe(payload.summary);
    expect(parsed.suggested_severity).toBe("high");
  });
});

describe("summarizeIncident", () => {
  it("returns null when the LLM response is invalid", async () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";

    const { summarizeIncident } = await import("./llm.js");
    const result = await summarizeIncident(sampleIncident);

    expect(result).toBeNull();
  });
});
