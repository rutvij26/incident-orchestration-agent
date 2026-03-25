import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createLlmConnector,
  createEmbeddingConnector,
  resolveLlmConnectors,
  resolveEmbeddingConnector,
  resolveSourceConnectors,
  fanOut,
  withFallback,
  aggregateLogs,
} from "./registry.js";
import { OpenAILlmConnector } from "./llm/openai.js";
import { AnthropicLlmConnector } from "./llm/anthropic.js";
import { GeminiLlmConnector } from "./llm/gemini.js";
import { OpenAIEmbeddingConnector } from "./embedding/openai.js";
import { GeminiEmbeddingConnector } from "./embedding/gemini.js";
import { LokiSourceConnector } from "./source/loki.js";
import { logger } from "../lib/logger.js";
import type { SourceConnector, LogEvent } from "./source/interface.js";

vi.mock("./llm/openai.js", () => ({
  OpenAILlmConnector: vi.fn().mockImplementation((...args: unknown[]) => ({
    _type: "openai-llm",
    _args: args,
  })),
}));

vi.mock("./llm/anthropic.js", () => ({
  AnthropicLlmConnector: vi.fn().mockImplementation((...args: unknown[]) => ({
    _type: "anthropic-llm",
    _args: args,
  })),
}));

vi.mock("./llm/gemini.js", () => ({
  GeminiLlmConnector: vi.fn().mockImplementation((...args: unknown[]) => ({
    _type: "gemini-llm",
    _args: args,
  })),
}));

vi.mock("./embedding/openai.js", () => ({
  OpenAIEmbeddingConnector: vi
    .fn()
    .mockImplementation((...args: unknown[]) => ({
      _type: "openai-emb",
      _args: args,
    })),
}));

vi.mock("./embedding/gemini.js", () => ({
  GeminiEmbeddingConnector: vi
    .fn()
    .mockImplementation((...args: unknown[]) => ({
      _type: "gemini-emb",
      _args: args,
    })),
}));

vi.mock("./source/loki.js", () => ({
  LokiSourceConnector: vi.fn().mockImplementation((...args: unknown[]) => ({
    _type: "loki-source",
    _args: args,
  })),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

afterEach(() => vi.clearAllMocks());

// ─── Minimal config fixture ──────────────────────────────────────────────────

const baseConfig = {
  LLM_PROVIDER: "auto" as const,
  OPENAI_API_KEY: undefined as string | undefined,
  OPENAI_MODEL: "gpt-4o-mini",
  ANTHROPIC_API_KEY: undefined as string | undefined,
  ANTHROPIC_MODEL: "claude-3-haiku",
  GEMINI_API_KEY: undefined as string | undefined,
  GEMINI_MODEL: "gemini-1.5-flash",
  EMBEDDING_PROVIDER: "auto" as const,
  EMBEDDING_MODEL: "text-embedding-3-small",
  EMBEDDING_DIM: 1536,
  LLM_CONNECTORS: undefined as string | undefined,
  EMBEDDING_CONNECTOR: undefined as string | undefined,
  SOURCE_CONNECTORS: "loki",
  LOKI_URL: "http://localhost:3100",
  LOKI_QUERY: '{job="demo-services"}',
} as any;

// ─── createLlmConnector ──────────────────────────────────────────────────────

describe("createLlmConnector", () => {
  it("returns OpenAILlmConnector for openai provider", () => {
    const result = createLlmConnector(
      { provider: "openai", model: "gpt-4o-mini" },
      { ...baseConfig, OPENAI_API_KEY: "sk-test" },
    );
    expect(OpenAILlmConnector).toHaveBeenCalledWith("sk-test", "gpt-4o-mini");
    expect((result as any)._type).toBe("openai-llm");
  });

  it("returns AnthropicLlmConnector for anthropic provider", () => {
    const result = createLlmConnector(
      { provider: "anthropic", model: "claude-3-haiku" },
      { ...baseConfig, ANTHROPIC_API_KEY: "ant-key" },
    );
    expect(AnthropicLlmConnector).toHaveBeenCalledWith("ant-key", "claude-3-haiku");
    expect((result as any)._type).toBe("anthropic-llm");
  });

  it("returns GeminiLlmConnector for gemini provider", () => {
    const result = createLlmConnector(
      { provider: "gemini", model: "gemini-1.5-flash" },
      { ...baseConfig, GEMINI_API_KEY: "gem-key" },
    );
    expect(GeminiLlmConnector).toHaveBeenCalledWith("gem-key", "gemini-1.5-flash");
    expect((result as any)._type).toBe("gemini-llm");
  });

  it("falls back to empty string when API key is absent", () => {
    createLlmConnector({ provider: "openai", model: "gpt-4o-mini" }, baseConfig);
    expect(OpenAILlmConnector).toHaveBeenCalledWith("", "gpt-4o-mini");
  });
});

// ─── createEmbeddingConnector ────────────────────────────────────────────────

describe("createEmbeddingConnector", () => {
  it("returns OpenAIEmbeddingConnector for openai provider", () => {
    const result = createEmbeddingConnector(
      { provider: "openai", model: "text-embedding-3-small" },
      { ...baseConfig, OPENAI_API_KEY: "sk-test", EMBEDDING_DIM: 1536 },
    );
    expect(OpenAIEmbeddingConnector).toHaveBeenCalledWith(
      "sk-test",
      "text-embedding-3-small",
      1536,
    );
    expect((result as any)._type).toBe("openai-emb");
  });

  it("returns GeminiEmbeddingConnector for gemini provider", () => {
    const result = createEmbeddingConnector(
      { provider: "gemini", model: "gemini-embed" },
      { ...baseConfig, GEMINI_API_KEY: "gem-key", EMBEDDING_DIM: 768 },
    );
    expect(GeminiEmbeddingConnector).toHaveBeenCalledWith(
      "gem-key",
      "gemini-embed",
      768,
    );
    expect((result as any)._type).toBe("gemini-emb");
  });
});

// ─── resolveLlmConnectors ────────────────────────────────────────────────────

describe("resolveLlmConnectors", () => {
  it("returns empty array when no keys are configured (auto)", () => {
    const result = resolveLlmConnectors(baseConfig);
    expect(result).toHaveLength(0);
  });

  it("returns [OpenAI] when auto and only openai key set", () => {
    const result = resolveLlmConnectors({
      ...baseConfig,
      OPENAI_API_KEY: "sk",
    });
    expect(result).toHaveLength(1);
    expect((result[0] as any)._type).toBe("openai-llm");
  });

  it("returns [Anthropic] when auto and only anthropic key set", () => {
    const result = resolveLlmConnectors({
      ...baseConfig,
      ANTHROPIC_API_KEY: "ant",
    });
    expect(result).toHaveLength(1);
    expect((result[0] as any)._type).toBe("anthropic-llm");
  });

  it("returns [Gemini] when auto and only gemini key set", () => {
    const result = resolveLlmConnectors({
      ...baseConfig,
      GEMINI_API_KEY: "gem",
    });
    expect(result).toHaveLength(1);
    expect((result[0] as any)._type).toBe("gemini-llm");
  });

  it("returns both connectors for explicit multi-connector list", () => {
    const result = resolveLlmConnectors({
      ...baseConfig,
      LLM_CONNECTORS: "openai,anthropic",
      OPENAI_API_KEY: "sk",
      ANTHROPIC_API_KEY: "ant",
    });
    expect(result).toHaveLength(2);
    expect((result[0] as any)._type).toBe("openai-llm");
    expect((result[1] as any)._type).toBe("anthropic-llm");
  });

  it("LLM_CONNECTORS takes precedence over LLM_PROVIDER", () => {
    // LLM_PROVIDER says openai but LLM_CONNECTORS says anthropic
    const result = resolveLlmConnectors({
      ...baseConfig,
      LLM_PROVIDER: "openai",
      LLM_CONNECTORS: "anthropic",
      OPENAI_API_KEY: "sk",
      ANTHROPIC_API_KEY: "ant",
    });
    expect(result).toHaveLength(1);
    expect((result[0] as any)._type).toBe("anthropic-llm");
  });

  it("skips connectors with missing keys in multi-connector list", () => {
    const result = resolveLlmConnectors({
      ...baseConfig,
      LLM_CONNECTORS: "openai,anthropic",
      OPENAI_API_KEY: "sk",
      // no ANTHROPIC_API_KEY
    });
    expect(result).toHaveLength(1);
    expect((result[0] as any)._type).toBe("openai-llm");
  });

  it("respects explicit single provider from LLM_PROVIDER (no LLM_CONNECTORS)", () => {
    const result = resolveLlmConnectors({
      ...baseConfig,
      LLM_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "ant",
    });
    expect(result).toHaveLength(1);
    expect((result[0] as any)._type).toBe("anthropic-llm");
  });
});

// ─── resolveEmbeddingConnector ───────────────────────────────────────────────

describe("resolveEmbeddingConnector", () => {
  it("returns null for provider=none", () => {
    expect(
      resolveEmbeddingConnector({ ...baseConfig, EMBEDDING_PROVIDER: "none" }),
    ).toBeNull();
  });

  it("returns null when EMBEDDING_CONNECTOR=none", () => {
    expect(
      resolveEmbeddingConnector({
        ...baseConfig,
        EMBEDDING_CONNECTOR: "none",
      }),
    ).toBeNull();
  });

  it("returns OpenAI connector for explicit openai + key", () => {
    const result = resolveEmbeddingConnector({
      ...baseConfig,
      EMBEDDING_PROVIDER: "openai",
      OPENAI_API_KEY: "sk",
    });
    expect((result as any)._type).toBe("openai-emb");
  });

  it("returns null for openai provider with no key", () => {
    expect(
      resolveEmbeddingConnector({
        ...baseConfig,
        EMBEDDING_PROVIDER: "openai",
      }),
    ).toBeNull();
  });

  it("returns Gemini connector for explicit gemini + key", () => {
    const result = resolveEmbeddingConnector({
      ...baseConfig,
      EMBEDDING_PROVIDER: "gemini",
      GEMINI_API_KEY: "gem",
    });
    expect((result as any)._type).toBe("gemini-emb");
  });

  it("returns null for gemini provider with no key", () => {
    expect(
      resolveEmbeddingConnector({
        ...baseConfig,
        EMBEDDING_PROVIDER: "gemini",
      }),
    ).toBeNull();
  });

  it("auto-selects OpenAI when openai key available", () => {
    const result = resolveEmbeddingConnector({
      ...baseConfig,
      OPENAI_API_KEY: "sk",
    });
    expect((result as any)._type).toBe("openai-emb");
  });

  it("auto-selects Gemini when only gemini key available", () => {
    const result = resolveEmbeddingConnector({
      ...baseConfig,
      GEMINI_API_KEY: "gem",
    });
    expect((result as any)._type).toBe("gemini-emb");
  });

  it("returns null when auto and no keys", () => {
    expect(resolveEmbeddingConnector(baseConfig)).toBeNull();
  });

  it("EMBEDDING_CONNECTOR takes precedence over EMBEDDING_PROVIDER", () => {
    const result = resolveEmbeddingConnector({
      ...baseConfig,
      EMBEDDING_PROVIDER: "openai",
      EMBEDDING_CONNECTOR: "gemini",
      OPENAI_API_KEY: "sk",
      GEMINI_API_KEY: "gem",
    });
    expect((result as any)._type).toBe("gemini-emb");
  });
});

// ─── resolveSourceConnectors ─────────────────────────────────────────────────

describe("resolveSourceConnectors", () => {
  it("returns [LokiSourceConnector] for SOURCE_CONNECTORS=loki with correct args", () => {
    const result = resolveSourceConnectors(baseConfig);
    expect(LokiSourceConnector).toHaveBeenCalledWith(
      "http://localhost:3100",
      '{job="demo-services"}',
    );
    expect(result).toHaveLength(1);
    expect((result[0] as any)._type).toBe("loki-source");
  });

  it("returns empty array for unknown connector name and logs a warning", () => {
    const result = resolveSourceConnectors({
      ...baseConfig,
      SOURCE_CONNECTORS: "datadog",
    });
    expect(result).toHaveLength(0);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining("datadog"),
    );
  });

  it("returns empty array when SOURCE_CONNECTORS is empty string", () => {
    const result = resolveSourceConnectors({
      ...baseConfig,
      SOURCE_CONNECTORS: "",
    });
    expect(result).toHaveLength(0);
  });

  it("returns two connectors for SOURCE_CONNECTORS=loki,loki", () => {
    const result = resolveSourceConnectors({
      ...baseConfig,
      SOURCE_CONNECTORS: "loki,loki",
    });
    expect(result).toHaveLength(2);
    expect((result[0] as any)._type).toBe("loki-source");
    expect((result[1] as any)._type).toBe("loki-source");
  });

  it("trims whitespace around connector names", () => {
    const result = resolveSourceConnectors({
      ...baseConfig,
      SOURCE_CONNECTORS: "  loki  ",
    });
    expect(result).toHaveLength(1);
    expect((result[0] as any)._type).toBe("loki-source");
  });

  it("handles mixed known and unknown connectors", () => {
    const result = resolveSourceConnectors({
      ...baseConfig,
      SOURCE_CONNECTORS: "loki,datadog",
    });
    expect(result).toHaveLength(1);
    expect((result[0] as any)._type).toBe("loki-source");
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.stringContaining("datadog"),
    );
  });
});

// ─── fanOut ──────────────────────────────────────────────────────────────────

describe("fanOut", () => {
  it("calls all handlers with the event", async () => {
    const h1 = vi.fn().mockResolvedValue(undefined);
    const h2 = vi.fn().mockResolvedValue(undefined);
    await fanOut([h1, h2], "payload");
    expect(h1).toHaveBeenCalledWith("payload");
    expect(h2).toHaveBeenCalledWith("payload");
  });

  it("resolves even when some handlers fail", async () => {
    const h1 = vi.fn().mockRejectedValue(new Error("boom"));
    const h2 = vi.fn().mockResolvedValue(undefined);
    await expect(fanOut([h1, h2], "evt")).resolves.toBeUndefined();
    expect(h2).toHaveBeenCalled();
  });

  it("resolves immediately for empty handler list", async () => {
    await expect(fanOut([], "evt")).resolves.toBeUndefined();
  });
});

// ─── withFallback ────────────────────────────────────────────────────────────

describe("withFallback", () => {
  it("returns result from first connector on success", async () => {
    const connectors = ["a", "b"];
    const call = vi.fn().mockResolvedValue("result");
    const result = await withFallback(connectors, call);
    expect(result).toBe("result");
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith("a");
  });

  it("falls back to second connector when first throws", async () => {
    const connectors = ["a", "b"];
    const call = vi
      .fn()
      .mockRejectedValueOnce(new Error("first fail"))
      .mockResolvedValue("fallback");
    const result = await withFallback(connectors, call);
    expect(result).toBe("fallback");
    expect(call).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenNthCalledWith(2, "b");
  });

  it("throws last error when all connectors fail", async () => {
    const call = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(withFallback(["a", "b"], call)).rejects.toThrow("always fails");
  });

  it("throws immediately for empty connectors list", async () => {
    await expect(withFallback([], vi.fn())).rejects.toThrow("no connectors");
  });
});

// ─── aggregateLogs ───────────────────────────────────────────────────────────

describe("aggregateLogs", () => {
  const opts = { start: new Date(), end: new Date(), limit: 10 };

  const makeEvent = (ts: string, msg: string): LogEvent => ({
    timestamp: ts,
    message: msg,
    labels: {},
  });

  it("returns empty for empty connectors", async () => {
    expect(await aggregateLogs([], opts)).toEqual([]);
  });

  it("merges events from multiple connectors", async () => {
    const c1: SourceConnector = {
      fetchLogs: vi
        .fn()
        .mockResolvedValue([makeEvent("t1", "msg-a"), makeEvent("t2", "msg-b")]),
    };
    const c2: SourceConnector = {
      fetchLogs: vi.fn().mockResolvedValue([makeEvent("t3", "msg-c")]),
    };
    const result = await aggregateLogs([c1, c2], opts);
    expect(result).toHaveLength(3);
  });

  it("deduplicates events with same timestamp+message", async () => {
    const event = makeEvent("t1", "duplicate");
    const c1: SourceConnector = {
      fetchLogs: vi.fn().mockResolvedValue([event]),
    };
    const c2: SourceConnector = {
      fetchLogs: vi.fn().mockResolvedValue([event]),
    };
    const result = await aggregateLogs([c1, c2], opts);
    expect(result).toHaveLength(1);
  });

  it("skips results from failing connectors", async () => {
    const good: SourceConnector = {
      fetchLogs: vi.fn().mockResolvedValue([makeEvent("t1", "ok")]),
    };
    const bad: SourceConnector = {
      fetchLogs: vi.fn().mockRejectedValue(new Error("offline")),
    };
    const result = await aggregateLogs([good, bad], opts);
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe("ok");
  });
});
