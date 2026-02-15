import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";
import type { Incident, IncidentSummary, IncidentSeverity } from "./types.js";

type LlmProvider = "auto" | "openai" | "anthropic" | "gemini";

const SummarySchema = z.object({
  summary: z.string().min(1),
  root_cause: z.string().min(1),
  recommended_actions: z.array(z.string().min(1)).min(1),
  suggested_severity: z.enum(["low", "medium", "high", "critical"]),
  suggested_labels: z.array(z.string().min(1)).max(5).default([]),
  confidence: z.number().min(0).max(1),
});

const FixSchema = z.object({
  summary: z.string().min(1),
  reason: z.string().min(1),
  test_plan: z.array(z.string().min(1)).min(1),
  diff: z.string().min(1),
});

const FixRewriteSchema = z.object({
  summary: z.string().min(1),
  reason: z.string().min(1),
  test_plan: z.array(z.string().min(1)).min(1),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        content: z.string().min(1),
      })
    )
    .min(1),
});
let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;
let geminiClient: GoogleGenerativeAI | null = null;

function buildPrompt(incident: Incident): string {
  return [
    "You are an SRE incident analyst.",
    "Return JSON only, with this exact schema:",
    "{",
    '  "summary": "string",',
    '  "root_cause": "string",',
    '  "recommended_actions": ["string", "..."],',
    '  "suggested_severity": "low|medium|high|critical",',
    '  "suggested_labels": ["string", "..."],',
    '  "confidence": 0.0',
    "}",
    "",
    "Rules:",
    "- Output valid JSON only (no markdown).",
    "- Keep recommended_actions to 3-5 items.",
    "- Keep suggested_labels to <= 5 items.",
    "",
    "Incident:",
    JSON.stringify(
      {
        title: incident.title,
        severity: incident.severity,
        count: incident.count,
        firstSeen: incident.firstSeen,
        lastSeen: incident.lastSeen,
        evidence: incident.evidence,
      },
      null,
      2,
    ),
  ].join("\n");
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("LLM response missing JSON payload");
  }
  return text.slice(start, end + 1);
}

function mapSummary(parsed: z.infer<typeof SummarySchema>): IncidentSummary {
  return {
    summary: parsed.summary,
    rootCause: parsed.root_cause,
    recommendedActions: parsed.recommended_actions,
    suggestedSeverity: parsed.suggested_severity as IncidentSeverity,
    suggestedLabels: parsed.suggested_labels,
    confidence: parsed.confidence,
  };
}

function resolveProvider(
  provider: LlmProvider,
  openaiKey?: string,
  anthropicKey?: string,
  geminiKey?: string,
): { provider: "openai" | "anthropic" | "gemini"; model: string } | null {
  if (provider === "openai") {
    return openaiKey
      ? { provider: "openai", model: getConfig().OPENAI_MODEL }
      : null;
  }
  if (provider === "anthropic") {
    return anthropicKey
      ? { provider: "anthropic", model: getConfig().ANTHROPIC_MODEL }
      : null;
  }
  if (provider === "gemini") {
    return geminiKey
      ? { provider: "gemini", model: getConfig().GEMINI_MODEL }
      : null;
  }
  if (openaiKey) {
    return { provider: "openai", model: getConfig().OPENAI_MODEL };
  }
  if (anthropicKey) {
    return { provider: "anthropic", model: getConfig().ANTHROPIC_MODEL };
  }
  if (geminiKey) {
    return { provider: "gemini", model: getConfig().GEMINI_MODEL };
  }
  return null;
}

export async function summarizeIncident(
  incident: Incident,
): Promise<IncidentSummary | null> {
  const config = getConfig();
  const resolved = resolveProvider(
    config.LLM_PROVIDER,
    config.OPENAI_API_KEY,
    config.ANTHROPIC_API_KEY,
    config.GEMINI_API_KEY,
  );

  if (!resolved) {
    logger.info("LLM summary skipped (no provider/api key configured)");
    return null;
  }

  try {
    const prompt = buildPrompt(incident);
    let raw = "";

    if (resolved.provider === "openai") {
      if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey: config.OPENAI_API_KEY });
      }
      const response = await openaiClient.chat.completions.create({
        model: resolved.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: "Return JSON only." },
          { role: "user", content: prompt },
        ],
      });
      raw = response.choices[0]?.message?.content ?? "";
    } else if (resolved.provider === "anthropic") {
      if (!anthropicClient) {
        anthropicClient = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
      }
      const response = await anthropicClient.messages.create({
        model: resolved.model,
        max_tokens: 512,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      });
      const block = response.content.find((item) => item.type === "text");
      raw = block?.text ?? "";
    } else {
      if (!geminiClient) {
        geminiClient = new GoogleGenerativeAI(config.GEMINI_API_KEY ?? "");
      }
      const model = geminiClient.getGenerativeModel({ model: resolved.model });
      const response = await model.generateContent(prompt);
      raw = response.response.text();
    }

    const json = extractJson(raw);
    const parsed = SummarySchema.parse(JSON.parse(json));
    const summary = mapSummary(parsed);
    logger.info("LLM summary generated", {
      incidentId: incident.id,
      suggestedSeverity: summary.suggestedSeverity,
      confidence: summary.confidence,
      labels: summary.suggestedLabels,
      summary: summary.summary,
      rootCause: summary.rootCause,
      recommendedActions: summary.recommendedActions,
    });
    return summary;
  } catch (error) {
    logger.warn("LLM summary failed", { error: String(error) });
    return null;
  }
}

export type FixProposal = z.infer<typeof FixSchema>;
export type FixRewrite = z.infer<typeof FixRewriteSchema>;

function buildFixPrompt(input: {
  incident: Incident;
  repoContext: Array<{ path: string; content: string }>;
  strictDiff?: boolean;
}): string {
  const strictRules = input.strictDiff
    ? [
        "- Include full unified diffs with `diff --git a/... b/...` headers.",
        "- Ensure each file includes `--- a/...` and `+++ b/...` lines.",
        "- Include at least one `@@` hunk per modified file.",
        "- The diff must apply cleanly with `git apply`; use exact context lines from the provided repo snippets.",
      ]
    : [];
  return [
    "You are a senior engineer fixing a production incident.",
    "Generate a minimal, safe code patch using the provided repo context.",
    "Return JSON only with this exact schema:",
    "{",
    '  "summary": "string",',
    '  "reason": "string",',
    '  "test_plan": ["string", "..."],',
    '  "diff": "unified diff string"',
    "}",
    "",
    "Rules:",
    "- Output valid JSON only (no markdown).",
    "- The diff must be a valid unified diff that applies cleanly.",
    "- Keep the change minimal and focused on the incident.",
    "- Do not modify secrets or environment files.",
    ...strictRules,
    "",
    "Incident:",
    JSON.stringify(
      {
        title: input.incident.title,
        severity: input.incident.severity,
        count: input.incident.count,
        firstSeen: input.incident.firstSeen,
        lastSeen: input.incident.lastSeen,
        evidence: input.incident.evidence,
      },
      null,
      2,
    ),
    "",
    "Repo context snippets:",
    JSON.stringify(
      input.repoContext.map((item) => ({
        path: item.path,
        content: item.content,
      })),
      null,
      2,
    ),
  ].join("\n");
}

function buildFixRewritePrompt(input: {
  incident: Incident;
  repoContext: Array<{ path: string; content: string }>;
}): string {
  return [
    "You are a senior engineer fixing a production incident.",
    "Generate a minimal, safe change by returning full updated file contents.",
    "Return JSON only with this exact schema:",
    "{",
    '  "summary": "string",',
    '  "reason": "string",',
    '  "test_plan": ["string", "..."],',
    '  "files": [{"path": "string", "content": "string"}]',
    "}",
    "",
    "Rules:",
    "- Output valid JSON only (no markdown).",
    "- Only include files you are changing.",
    "- Provide full file content for each file in `files`.",
    "- Keep the change minimal and focused on the incident.",
    "- Do not modify secrets or environment files.",
    "",
    "Incident:",
    JSON.stringify(
      {
        title: input.incident.title,
        severity: input.incident.severity,
        count: input.incident.count,
        firstSeen: input.incident.firstSeen,
        lastSeen: input.incident.lastSeen,
        evidence: input.incident.evidence,
      },
      null,
      2
    ),
    "",
    "Repo context snippets:",
    JSON.stringify(
      input.repoContext.map((item) => ({
        path: item.path,
        content: item.content,
      })),
      null,
      2
    ),
  ].join("\n");
}

export async function generateFixProposal(input: {
  incident: Incident;
  repoContext: Array<{ path: string; content: string }>;
  strictDiff?: boolean;
}): Promise<FixProposal | null> {
  const config = getConfig();
  const resolved = resolveProvider(
    config.LLM_PROVIDER,
    config.OPENAI_API_KEY,
    config.ANTHROPIC_API_KEY,
    config.GEMINI_API_KEY,
  );

  if (!resolved) {
    logger.info("Fix proposal skipped (no provider/api key configured)");
    return null;
  }

  try {
    const prompt = buildFixPrompt(input);
    let raw = "";

    if (resolved.provider === "openai") {
      if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey: config.OPENAI_API_KEY });
      }
      const response = await openaiClient.chat.completions.create({
        model: resolved.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: "Return JSON only." },
          { role: "user", content: prompt },
        ],
      });
      raw = response.choices[0]?.message?.content ?? "";
    } else if (resolved.provider === "anthropic") {
      if (!anthropicClient) {
        anthropicClient = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
      }
      const response = await anthropicClient.messages.create({
        model: resolved.model,
        max_tokens: 1024,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      });
      const block = response.content.find((item) => item.type === "text");
      raw = block?.text ?? "";
    } else {
      if (!geminiClient) {
        geminiClient = new GoogleGenerativeAI(config.GEMINI_API_KEY ?? "");
      }
      const model = geminiClient.getGenerativeModel({ model: resolved.model });
      const response = await model.generateContent(prompt);
      raw = response.response.text();
    }

    const json = extractJson(raw);
    return FixSchema.parse(JSON.parse(json));
  } catch (error) {
    logger.warn("Fix proposal failed", { error: String(error) });
    return null;
  }
}

export async function generateFixRewrite(input: {
  incident: Incident;
  repoContext: Array<{ path: string; content: string }>;
}): Promise<FixRewrite | null> {
  const config = getConfig();
  const resolved = resolveProvider(
    config.LLM_PROVIDER,
    config.OPENAI_API_KEY,
    config.ANTHROPIC_API_KEY,
    config.GEMINI_API_KEY
  );

  if (!resolved) {
    logger.info("Fix rewrite skipped (no provider/api key configured)");
    return null;
  }

  try {
    const prompt = buildFixRewritePrompt(input);
    let raw = "";

    if (resolved.provider === "openai") {
      if (!openaiClient) {
        openaiClient = new OpenAI({ apiKey: config.OPENAI_API_KEY });
      }
      const response = await openaiClient.chat.completions.create({
        model: resolved.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: "Return JSON only." },
          { role: "user", content: prompt },
        ],
      });
      raw = response.choices[0]?.message?.content ?? "";
    } else if (resolved.provider === "anthropic") {
      if (!anthropicClient) {
        anthropicClient = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
      }
      const response = await anthropicClient.messages.create({
        model: resolved.model,
        max_tokens: 2048,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      });
      const block = response.content.find((item) => item.type === "text");
      raw = block?.text ?? "";
    } else {
      if (!geminiClient) {
        geminiClient = new GoogleGenerativeAI(config.GEMINI_API_KEY ?? "");
      }
      const model = geminiClient.getGenerativeModel({ model: resolved.model });
      const response = await model.generateContent(prompt);
      raw = response.response.text();
    }

    const json = extractJson(raw);
    return FixRewriteSchema.parse(JSON.parse(json));
  } catch (error) {
    logger.warn("Fix rewrite failed", { error: String(error) });
    return null;
  }
}

export const __test__ = {
  extractJson,
  resolveProvider,
  SummarySchema,
  FixSchema,
  FixRewriteSchema,
};
