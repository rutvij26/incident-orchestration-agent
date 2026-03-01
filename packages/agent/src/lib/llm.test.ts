import { afterEach, describe, expect, it, vi } from "vitest";
import type { Incident } from "./types.js";

// ─── Hoisted spies (survive vi.resetModules) ─────────────────────────────────

const { mockChatCreate, mockMessagesCreate, mockGenerateContent, mockGetConfig } =
  vi.hoisted(() => ({
    mockChatCreate: vi.fn(),
    mockMessagesCreate: vi.fn(),
    mockGenerateContent: vi.fn(),
    mockGetConfig: vi.fn(),
  }));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: mockChatCreate } };
  },
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockMessagesCreate };
  },
}));

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return { generateContent: mockGenerateContent };
    }
  },
}));

vi.mock("./config.js", () => ({ getConfig: mockGetConfig }));
vi.mock("./logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const sampleIncident: Incident = {
  id: "incident-1",
  title: "Error burst on /api/orders",
  severity: "high",
  evidence: ["Synthetic error burst"],
  firstSeen: "2026-02-13T00:00:00Z",
  lastSeen: "2026-02-13T00:05:00Z",
  count: 5,
};

const repoContext = [{ path: "src/index.ts", content: "const x = 1;" }];

// Valid JSON payloads for each schema
const validSummaryJson = JSON.stringify({
  summary: "Error burst on API",
  root_cause: "Upstream 500s",
  recommended_actions: ["Check upstream", "Add retry"],
  suggested_severity: "high",
  suggested_labels: ["api"],
  confidence: 0.8,
});

const validFixJson = JSON.stringify({
  summary: "Fix null check",
  reason: "Missing guard",
  test_plan: ["npm test"],
  diff: "--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-x\n+y",
});

const validFixRewriteJson = JSON.stringify({
  summary: "Rewrite fix",
  reason: "Complex change",
  test_plan: ["npm test"],
  files: [{ path: "src/index.ts", content: "const x = 2;" }],
});

const validFixabilityJson = JSON.stringify({
  fixability_score: 0.85,
  reason: "Clear code fix available",
});

// Provider config helpers
const openaiConfig = {
  LLM_PROVIDER: "openai",
  OPENAI_API_KEY: "ok",
  OPENAI_MODEL: "gpt-4o-mini",
  ANTHROPIC_API_KEY: undefined,
  ANTHROPIC_MODEL: "claude-3-haiku-20240307",
  GEMINI_API_KEY: undefined,
  GEMINI_MODEL: "gemini-1.5-flash",
};

const anthropicConfig = {
  LLM_PROVIDER: "anthropic",
  OPENAI_API_KEY: undefined,
  OPENAI_MODEL: "gpt-4o-mini",
  ANTHROPIC_API_KEY: "ok",
  ANTHROPIC_MODEL: "claude-3-haiku-20240307",
  GEMINI_API_KEY: undefined,
  GEMINI_MODEL: "gemini-1.5-flash",
};

const geminiConfig = {
  LLM_PROVIDER: "gemini",
  OPENAI_API_KEY: undefined,
  OPENAI_MODEL: "gpt-4o-mini",
  ANTHROPIC_API_KEY: undefined,
  ANTHROPIC_MODEL: "claude-3-haiku-20240307",
  GEMINI_API_KEY: "ok",
  GEMINI_MODEL: "gemini-1.5-flash",
};

const noProviderConfig = {
  LLM_PROVIDER: "auto",
  OPENAI_API_KEY: undefined,
  OPENAI_MODEL: "gpt-4o-mini",
  ANTHROPIC_API_KEY: undefined,
  ANTHROPIC_MODEL: "claude-3-haiku-20240307",
  GEMINI_API_KEY: undefined,
  GEMINI_MODEL: "gemini-1.5-flash",
};

// Response builders
const openaiResp = (content: string) => ({
  choices: [{ message: { content } }],
});
const anthropicResp = (text: string) => ({
  content: [{ type: "text", text }],
});
const geminiResp = (text: string) => ({
  response: { text: () => text },
});

// Reset module cache after every test so module-level singletons (openaiClient
// etc.) are re-created fresh, ensuring isolation between provider tests.
afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

// ─── resolveProvider ──────────────────────────────────────────────────────────

describe("resolveProvider", () => {
  it("selects the correct provider/model for explicit keys", async () => {
    mockGetConfig.mockReturnValue({
      ...openaiConfig,
      OPENAI_MODEL: "gpt-4o",
      ANTHROPIC_MODEL: "claude-3",
      GEMINI_MODEL: "gemini-2.0",
    });
    const { __test__ } = await import("./llm.js");

    expect(__test__.resolveProvider("openai", "ok", undefined)).toEqual({
      provider: "openai",
      model: "gpt-4o",
    });
    expect(__test__.resolveProvider("openai", undefined, "ok")).toBeNull();
    expect(__test__.resolveProvider("anthropic", "ok", "ok")).toEqual({
      provider: "anthropic",
      model: "claude-3",
    });
    expect(__test__.resolveProvider("gemini", "ok", "ok", "ok")).toEqual({
      provider: "gemini",
      model: "gemini-2.0",
    });
    expect(__test__.resolveProvider("gemini", "ok", "ok", undefined)).toBeNull();
    expect(__test__.resolveProvider("auto", "ok", "ok")).toEqual({
      provider: "openai",
      model: "gpt-4o",
    });
    expect(__test__.resolveProvider("auto", undefined, "ok")).toEqual({
      provider: "anthropic",
      model: "claude-3",
    });
    expect(__test__.resolveProvider("auto", undefined, undefined, "ok")).toEqual({
      provider: "gemini",
      model: "gemini-2.0",
    });
    expect(__test__.resolveProvider("auto", undefined, undefined)).toBeNull();
    // Explicit anthropic provider but no key → null (covers line 120)
    expect(__test__.resolveProvider("anthropic", undefined, undefined)).toBeNull();
  });
});

// ─── extractJson ─────────────────────────────────────────────────────────────

describe("extractJson", () => {
  it("extracts the JSON object from surrounding text", async () => {
    const { __test__ } = await import("./llm.js");
    const obj = { a: 1 };
    expect(JSON.parse(__test__.extractJson(`prefix ${JSON.stringify(obj)} suffix`))).toEqual(obj);
  });

  it("throws when no JSON object is found", async () => {
    const { __test__ } = await import("./llm.js");
    expect(() => __test__.extractJson("no braces here")).toThrow("missing JSON");
  });
});

// ─── summarizeIncident ────────────────────────────────────────────────────────

describe("summarizeIncident", () => {
  it("returns IncidentSummary via OpenAI", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validSummaryJson));
    const { summarizeIncident } = await import("./llm.js");
    const result = await summarizeIncident(sampleIncident);
    expect(result).not.toBeNull();
    expect(result?.suggestedSeverity).toBe("high");
    expect(result?.confidence).toBe(0.8);
  });

  it("returns IncidentSummary via Anthropic", async () => {
    mockGetConfig.mockReturnValue(anthropicConfig);
    mockMessagesCreate.mockResolvedValue(anthropicResp(validSummaryJson));
    const { summarizeIncident } = await import("./llm.js");
    const result = await summarizeIncident(sampleIncident);
    expect(result?.summary).toBe("Error burst on API");
  });

  it("returns IncidentSummary via Gemini", async () => {
    mockGetConfig.mockReturnValue(geminiConfig);
    mockGenerateContent.mockResolvedValue(geminiResp(validSummaryJson));
    const { summarizeIncident } = await import("./llm.js");
    const result = await summarizeIncident(sampleIncident);
    expect(result?.rootCause).toBe("Upstream 500s");
  });

  it("returns null when no provider is configured", async () => {
    mockGetConfig.mockReturnValue(noProviderConfig);
    const { summarizeIncident } = await import("./llm.js");
    expect(await summarizeIncident(sampleIncident)).toBeNull();
  });

  it("returns null when LLM response is not valid JSON", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp("not json"));
    const { summarizeIncident } = await import("./llm.js");
    expect(await summarizeIncident(sampleIncident)).toBeNull();
  });

  it("returns null when Anthropic content block has no text", async () => {
    mockGetConfig.mockReturnValue(anthropicConfig);
    mockMessagesCreate.mockResolvedValue({ content: [{ type: "image" }] });
    const { summarizeIncident } = await import("./llm.js");
    expect(await summarizeIncident(sampleIncident)).toBeNull();
  });

  it("returns null when OpenAI returns null message content", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    // null content → raw = "" → extractJson("") throws → returns null
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });
    const { summarizeIncident } = await import("./llm.js");
    expect(await summarizeIncident(sampleIncident)).toBeNull();
  });
});

// ─── assessFixability ─────────────────────────────────────────────────────────

describe("assessFixability", () => {
  const fixInput = { incident: sampleIncident, repoContext };

  it("returns FixabilityAssessment via OpenAI", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixabilityJson));
    const { assessFixability } = await import("./llm.js");
    const result = await assessFixability(fixInput);
    expect(result?.fixability_score).toBe(0.85);
    expect(result?.reason).toBe("Clear code fix available");
  });

  it("returns FixabilityAssessment via Anthropic", async () => {
    mockGetConfig.mockReturnValue(anthropicConfig);
    mockMessagesCreate.mockResolvedValue(anthropicResp(validFixabilityJson));
    const { assessFixability } = await import("./llm.js");
    const result = await assessFixability(fixInput);
    expect(result?.fixability_score).toBe(0.85);
  });

  it("returns FixabilityAssessment via Gemini", async () => {
    mockGetConfig.mockReturnValue(geminiConfig);
    mockGenerateContent.mockResolvedValue(geminiResp(validFixabilityJson));
    const { assessFixability } = await import("./llm.js");
    const result = await assessFixability(fixInput);
    expect(result?.fixability_score).toBe(0.85);
  });

  it("returns null when no provider is configured", async () => {
    mockGetConfig.mockReturnValue(noProviderConfig);
    const { assessFixability } = await import("./llm.js");
    expect(await assessFixability(fixInput)).toBeNull();
  });

  it("returns null on schema parse error", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp('{"fixability_score": "bad"}'));
    const { assessFixability } = await import("./llm.js");
    expect(await assessFixability(fixInput)).toBeNull();
  });

  it("returns null when Anthropic returns no text block in assessFixability", async () => {
    mockGetConfig.mockReturnValue(anthropicConfig);
    mockMessagesCreate.mockResolvedValue({ content: [] });
    const { assessFixability } = await import("./llm.js");
    expect(await assessFixability(fixInput)).toBeNull();
  });

  it("returns null when OpenAI returns null message content in assessFixability", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });
    const { assessFixability } = await import("./llm.js");
    expect(await assessFixability(fixInput)).toBeNull();
  });
});

// ─── generateFixProposal ──────────────────────────────────────────────────────

describe("generateFixProposal", () => {
  const fixInput = { incident: sampleIncident, repoContext };

  it("returns FixProposal via OpenAI", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixJson));
    const { generateFixProposal } = await import("./llm.js");
    const result = await generateFixProposal(fixInput);
    expect(result?.summary).toBe("Fix null check");
    expect(result?.diff).toContain("---");
  });

  it("returns FixProposal via OpenAI with strictDiff=true", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixJson));
    const { generateFixProposal } = await import("./llm.js");
    const result = await generateFixProposal({ ...fixInput, strictDiff: true });
    expect(result?.diff).toBeTruthy();
  });

  it("returns FixProposal via Anthropic", async () => {
    mockGetConfig.mockReturnValue(anthropicConfig);
    mockMessagesCreate.mockResolvedValue(anthropicResp(validFixJson));
    const { generateFixProposal } = await import("./llm.js");
    const result = await generateFixProposal(fixInput);
    expect(result?.reason).toBe("Missing guard");
  });

  it("returns FixProposal via Gemini", async () => {
    mockGetConfig.mockReturnValue(geminiConfig);
    mockGenerateContent.mockResolvedValue(geminiResp(validFixJson));
    const { generateFixProposal } = await import("./llm.js");
    const result = await generateFixProposal(fixInput);
    expect(result?.test_plan).toEqual(["npm test"]);
  });

  it("returns null when no provider is configured", async () => {
    mockGetConfig.mockReturnValue(noProviderConfig);
    const { generateFixProposal } = await import("./llm.js");
    expect(await generateFixProposal(fixInput)).toBeNull();
  });

  it("returns null when LLM throws", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockRejectedValue(new Error("rate limit"));
    const { generateFixProposal } = await import("./llm.js");
    expect(await generateFixProposal(fixInput)).toBeNull();
  });

  it("returns null when OpenAI returns null message content in generateFixProposal", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });
    const { generateFixProposal } = await import("./llm.js");
    expect(await generateFixProposal(fixInput)).toBeNull();
  });

  it("returns null when Anthropic returns no text block in generateFixProposal", async () => {
    mockGetConfig.mockReturnValue(anthropicConfig);
    mockMessagesCreate.mockResolvedValue({ content: [] });
    const { generateFixProposal } = await import("./llm.js");
    expect(await generateFixProposal(fixInput)).toBeNull();
  });
});

// ─── generateFixRewrite ───────────────────────────────────────────────────────

describe("generateFixRewrite", () => {
  const fixInput = { incident: sampleIncident, repoContext };

  it("returns FixRewrite via OpenAI", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixRewriteJson));
    const { generateFixRewrite } = await import("./llm.js");
    const result = await generateFixRewrite(fixInput);
    expect(result?.files).toHaveLength(1);
    expect(result?.files[0].path).toBe("src/index.ts");
  });

  it("returns FixRewrite via Anthropic", async () => {
    mockGetConfig.mockReturnValue(anthropicConfig);
    mockMessagesCreate.mockResolvedValue(anthropicResp(validFixRewriteJson));
    const { generateFixRewrite } = await import("./llm.js");
    const result = await generateFixRewrite(fixInput);
    expect(result?.summary).toBe("Rewrite fix");
  });

  it("returns FixRewrite via Gemini", async () => {
    mockGetConfig.mockReturnValue(geminiConfig);
    mockGenerateContent.mockResolvedValue(geminiResp(validFixRewriteJson));
    const { generateFixRewrite } = await import("./llm.js");
    const result = await generateFixRewrite(fixInput);
    expect(result?.reason).toBe("Complex change");
  });

  it("returns null when no provider is configured", async () => {
    mockGetConfig.mockReturnValue(noProviderConfig);
    const { generateFixRewrite } = await import("./llm.js");
    expect(await generateFixRewrite(fixInput)).toBeNull();
  });

  it("returns null on schema parse error", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp('{"files": "not-an-array"}'));
    const { generateFixRewrite } = await import("./llm.js");
    expect(await generateFixRewrite(fixInput)).toBeNull();
  });

  it("returns null when OpenAI returns null message content in generateFixRewrite", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });
    const { generateFixRewrite } = await import("./llm.js");
    expect(await generateFixRewrite(fixInput)).toBeNull();
  });

  it("returns null when Anthropic returns no text block in generateFixRewrite", async () => {
    mockGetConfig.mockReturnValue(anthropicConfig);
    mockMessagesCreate.mockResolvedValue({ content: [] });
    const { generateFixRewrite } = await import("./llm.js");
    expect(await generateFixRewrite(fixInput)).toBeNull();
  });
});
