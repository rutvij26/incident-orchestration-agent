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

  it("uses trackedFiles in Available Files section when provided (covers line 275)", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixJson));
    const { generateFixProposal } = await import("./llm.js");
    await generateFixProposal({
      ...fixInput,
      trackedFiles: ["apps/demo-services/src/index.ts"],
    });
    const callArgs = mockChatCreate.mock.calls[0][0];
    const fullPrompt = callArgs.messages
      .map((m: { content: string }) => m.content)
      .join("\n");
    expect(fullPrompt).toContain("apps/demo-services/src/index.ts");
  });

  it("includes plan section in prompt when plan is provided", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixJson));
    const { generateFixProposal } = await import("./llm.js");
    const plan = { files: ["src/index.ts"], approach: "Fix timeout", reasoning: "Too low" };
    const result = await generateFixProposal({ ...fixInput, plan });
    expect(result?.summary).toBe("Fix null check");
    // Verify plan was injected — mockChatCreate should have been called with the plan content
    const calledWith = mockChatCreate.mock.calls[0][0];
    const userMessage = calledWith.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("Fix Plan");
    expect(userMessage.content).toContain("src/index.ts");
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

  it("uses '(none available)' when both trackedFiles and repoContext are empty (covers line 280)", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixJson));
    const { generateFixProposal } = await import("./llm.js");
    await generateFixProposal({ incident: sampleIncident, repoContext: [], trackedFiles: [] });
    const callArgs = mockChatCreate.mock.calls[0][0];
    const fullPrompt = callArgs.messages.map((m: { content: string }) => m.content).join("\n");
    expect(fullPrompt).toContain("(none available)");
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

  it("uses trackedFiles in Available Files section when provided (covers line 323)", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixRewriteJson));
    const { generateFixRewrite } = await import("./llm.js");
    await generateFixRewrite({
      ...fixInput,
      trackedFiles: ["apps/demo-services/src/index.ts"],
    });
    const callArgs = mockChatCreate.mock.calls[0][0];
    const fullPrompt = callArgs.messages
      .map((m: { content: string }) => m.content)
      .join("\n");
    expect(fullPrompt).toContain("apps/demo-services/src/index.ts");
  });

  it("uses currentFiles section when provided and omits Repo context snippets", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixRewriteJson));
    const { generateFixRewrite } = await import("./llm.js");
    await generateFixRewrite({
      ...fixInput,
      currentFiles: [
        { path: "apps/demo-services/src/index.ts", content: 'import express from "express";\nconst app = express();\n' },
      ],
    });
    const callArgs = mockChatCreate.mock.calls[0][0];
    const fullPrompt = callArgs.messages
      .map((m: { content: string }) => m.content)
      .join("\n");
    expect(fullPrompt).toContain("Current file contents");
    expect(fullPrompt).toContain("apps/demo-services/src/index.ts");
    expect(fullPrompt).not.toContain("Repo context snippets");
  });

  it("falls back to Repo context snippets when currentFiles is empty", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixRewriteJson));
    const { generateFixRewrite } = await import("./llm.js");
    await generateFixRewrite({ ...fixInput, currentFiles: [] });
    const callArgs = mockChatCreate.mock.calls[0][0];
    const fullPrompt = callArgs.messages
      .map((m: { content: string }) => m.content)
      .join("\n");
    expect(fullPrompt).toContain("Repo context snippets");
    expect(fullPrompt).not.toContain("Current file contents");
  });

  it("uses '(none available)' when both trackedFiles and repoContext are empty (covers line 347)", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixRewriteJson));
    const { generateFixRewrite } = await import("./llm.js");
    await generateFixRewrite({ incident: sampleIncident, repoContext: [], trackedFiles: [], currentFiles: [] });
    const callArgs = mockChatCreate.mock.calls[0][0];
    const fullPrompt = callArgs.messages.map((m: { content: string }) => m.content).join("\n");
    expect(fullPrompt).toContain("(none available)");
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

// ─── generateFixPlan ──────────────────────────────────────────────────────────

describe("generateFixPlan", () => {
  const planInput = { incident: sampleIncident, repoContext };

  const validFixPlanJson = JSON.stringify({
    files: ["src/index.ts"],
    approach: "Increase the timeout constant",
    reasoning: "Low timeout causes failures under load",
  });

  it("returns FixPlan via OpenAI", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixPlanJson));
    const { generateFixPlan } = await import("./llm.js");
    const result = await generateFixPlan(planInput);
    expect(result?.files).toEqual(["src/index.ts"]);
    expect(result?.approach).toBe("Increase the timeout constant");
  });

  it("returns FixPlan via Anthropic", async () => {
    mockGetConfig.mockReturnValue(anthropicConfig);
    mockMessagesCreate.mockResolvedValue(anthropicResp(validFixPlanJson));
    const { generateFixPlan } = await import("./llm.js");
    const result = await generateFixPlan(planInput);
    expect(result?.reasoning).toBe("Low timeout causes failures under load");
  });

  it("returns FixPlan via Gemini", async () => {
    mockGetConfig.mockReturnValue(geminiConfig);
    mockGenerateContent.mockResolvedValue(geminiResp(validFixPlanJson));
    const { generateFixPlan } = await import("./llm.js");
    const result = await generateFixPlan(planInput);
    expect(result?.files).toEqual(["src/index.ts"]);
  });

  it("returns null when no provider configured", async () => {
    mockGetConfig.mockReturnValue(noProviderConfig);
    const { generateFixPlan } = await import("./llm.js");
    expect(await generateFixPlan(planInput)).toBeNull();
  });

  it("returns null on schema parse error (empty files array)", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(
      openaiResp(JSON.stringify({ files: [], approach: "x", reasoning: "y" })),
    );
    const { generateFixPlan } = await import("./llm.js");
    expect(await generateFixPlan(planInput)).toBeNull();
  });

  it("returns null when OpenAI returns invalid JSON", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp("not json at all"));
    const { generateFixPlan } = await import("./llm.js");
    expect(await generateFixPlan(planInput)).toBeNull();
  });

  it("returns null when OpenAI returns null message content", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });
    const { generateFixPlan } = await import("./llm.js");
    expect(await generateFixPlan(planInput)).toBeNull();
  });

  it("returns null when Anthropic returns no text block", async () => {
    mockGetConfig.mockReturnValue(anthropicConfig);
    mockMessagesCreate.mockResolvedValue({ content: [] });
    const { generateFixPlan } = await import("./llm.js");
    expect(await generateFixPlan(planInput)).toBeNull();
  });

  it("uses '(none available)' placeholder in prompt when repoContext is empty (covers line 498)", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixPlanJson));
    const { generateFixPlan } = await import("./llm.js");
    await generateFixPlan({ ...planInput, repoContext: [] });
    const callArgs = mockChatCreate.mock.calls[0][0];
    const fullPrompt = callArgs.messages
      .map((m: { content: string }) => m.content)
      .join("\n");
    expect(fullPrompt).toContain("(none available)");
  });

  it("uses trackedFiles in Available Files section when provided (covers line 483)", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixPlanJson));
    const { generateFixPlan } = await import("./llm.js");
    await generateFixPlan({
      ...planInput,
      trackedFiles: ["apps/demo-services/src/index.ts"],
    });
    const callArgs = mockChatCreate.mock.calls[0][0];
    const fullPrompt = callArgs.messages
      .map((m: { content: string }) => m.content)
      .join("\n");
    expect(fullPrompt).toContain("apps/demo-services/src/index.ts");
  });
});

// ─── verifyFixPatch ───────────────────────────────────────────────────────────

describe("verifyFixPatch", () => {
  const plan = {
    files: ["src/index.ts"],
    approach: "Fix the timeout",
    reasoning: "Too low",
  };
  const sampleDiff =
    "diff --git a/src/index.ts b/src/index.ts\n--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-x\n+y";

  const validFixVerifyJson = JSON.stringify({
    valid: true,
    confidence: 0.9,
    issues: [],
    verdict: "Patch correctly implements the plan",
  });

  it("returns FixVerify via OpenAI", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixVerifyJson));
    const { verifyFixPatch } = await import("./llm.js");
    const result = await verifyFixPatch({ incident: sampleIncident, plan, diff: sampleDiff });
    expect(result?.valid).toBe(true);
    expect(result?.confidence).toBe(0.9);
    expect(result?.issues).toEqual([]);
    expect(result?.verdict).toBe("Patch correctly implements the plan");
  });

  it("returns rejection result via Anthropic", async () => {
    mockGetConfig.mockReturnValue(anthropicConfig);
    mockMessagesCreate.mockResolvedValue(
      anthropicResp(
        JSON.stringify({
          valid: false,
          confidence: 0.85,
          issues: ["Modifies wrong file"],
          verdict: "Patch does not match plan",
        }),
      ),
    );
    const { verifyFixPatch } = await import("./llm.js");
    const result = await verifyFixPatch({ incident: sampleIncident, plan, diff: sampleDiff });
    expect(result?.valid).toBe(false);
    expect(result?.issues).toEqual(["Modifies wrong file"]);
  });

  it("returns FixVerify via Gemini", async () => {
    mockGetConfig.mockReturnValue(geminiConfig);
    mockGenerateContent.mockResolvedValue(geminiResp(validFixVerifyJson));
    const { verifyFixPatch } = await import("./llm.js");
    const result = await verifyFixPatch({ incident: sampleIncident, plan, diff: sampleDiff });
    expect(result?.verdict).toBe("Patch correctly implements the plan");
  });

  it("truncates long diffs in the prompt (>4000 chars)", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp(validFixVerifyJson));
    const { verifyFixPatch } = await import("./llm.js");
    const longDiff = "x".repeat(5000);
    const result = await verifyFixPatch({ incident: sampleIncident, plan, diff: longDiff });
    expect(result?.valid).toBe(true);
  });

  it("returns null when no provider configured", async () => {
    mockGetConfig.mockReturnValue(noProviderConfig);
    const { verifyFixPatch } = await import("./llm.js");
    expect(
      await verifyFixPatch({ incident: sampleIncident, plan, diff: sampleDiff }),
    ).toBeNull();
  });

  it("returns null on schema parse error", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue(openaiResp('{"valid": "not-a-bool"}'));
    const { verifyFixPatch } = await import("./llm.js");
    expect(
      await verifyFixPatch({ incident: sampleIncident, plan, diff: sampleDiff }),
    ).toBeNull();
  });

  it("returns null when OpenAI returns null message content", async () => {
    mockGetConfig.mockReturnValue(openaiConfig);
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });
    const { verifyFixPatch } = await import("./llm.js");
    expect(
      await verifyFixPatch({ incident: sampleIncident, plan, diff: sampleDiff }),
    ).toBeNull();
  });

  it("returns null when Anthropic returns no text block", async () => {
    mockGetConfig.mockReturnValue(anthropicConfig);
    mockMessagesCreate.mockResolvedValue({ content: [] });
    const { verifyFixPatch } = await import("./llm.js");
    expect(
      await verifyFixPatch({ incident: sampleIncident, plan, diff: sampleDiff }),
    ).toBeNull();
  });
});
