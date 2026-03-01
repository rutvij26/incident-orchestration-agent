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

const FixabilitySchema = z.object({
  fixability_score: z.number().min(0).max(1),
  reason: z.string().min(1),
});

const FixPlanSchema = z.object({
  files: z.array(z.string().min(1)).min(1),
  approach: z.string().min(1),
  reasoning: z.string().min(1),
});

const FixVerifySchema = z.object({
  valid: z.boolean(),
  confidence: z.number().min(0).max(1),
  issues: z.array(z.string()).default([]),
  verdict: z.string().min(1),
});

export type FixabilityAssessment = z.infer<typeof FixabilitySchema>;
export type FixPlan = z.infer<typeof FixPlanSchema>;
export type FixVerify = z.infer<typeof FixVerifySchema>;

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

/**
 * Dispatches a prompt to whichever LLM provider `resolveProvider` selected
 * and returns the raw text response. All exported LLM functions share this
 * single dispatch path — only the prompt, token budget, and temperature differ.
 */
async function callLlm(
  prompt: string,
  resolved: { provider: "openai" | "anthropic" | "gemini"; model: string },
  opts: { maxTokens: number; temperature: number },
): Promise<string> {
  const config = getConfig();
  if (resolved.provider === "openai") {
    if (!openaiClient) {
      openaiClient = new OpenAI({ apiKey: config.OPENAI_API_KEY });
    }
    const response = await openaiClient.chat.completions.create({
      model: resolved.model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      messages: [
        { role: "system", content: "Return JSON only." },
        { role: "user", content: prompt },
      ],
    });
    return response.choices[0]?.message?.content ?? "";
  }
  if (resolved.provider === "anthropic") {
    if (!anthropicClient) {
      anthropicClient = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
    }
    const response = await anthropicClient.messages.create({
      model: resolved.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content.find((item) => item.type === "text");
    return block?.text ?? "";
  }
  // gemini
  if (!geminiClient) {
    /* v8 ignore next */
    geminiClient = new GoogleGenerativeAI(config.GEMINI_API_KEY ?? "");
  }
  const model = geminiClient.getGenerativeModel({ model: resolved.model });
  const response = await model.generateContent(prompt);
  return response.response.text();
}

function resolvedProvider() {
  const config = getConfig();
  return resolveProvider(
    config.LLM_PROVIDER,
    config.OPENAI_API_KEY,
    config.ANTHROPIC_API_KEY,
    config.GEMINI_API_KEY,
  );
}

export async function summarizeIncident(
  incident: Incident,
): Promise<IncidentSummary | null> {
  const resolved = resolvedProvider();
  if (!resolved) {
    logger.info("LLM summary skipped (no provider/api key configured)");
    return null;
  }
  try {
    const raw = await callLlm(buildPrompt(incident), resolved, {
      maxTokens: 512,
      temperature: 0.2,
    });
    const parsed = SummarySchema.parse(JSON.parse(extractJson(raw)));
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
  plan?: FixPlan;
  trackedFiles?: string[];
}): string {
  const strictRules = input.strictDiff
    ? [
        "- Include full unified diffs with `diff --git a/... b/...` headers.",
        "- Ensure each file includes `--- a/...` and `+++ b/...` lines.",
        "- Include at least one `@@` hunk per modified file.",
        "- The diff must apply cleanly with `git apply`; use exact context lines from the provided repo snippets.",
      ]
    : [];
  const planSection = input.plan
    ? [
        "",
        "Fix Plan (follow this precisely — only modify files listed here):",
        `Target files: ${input.plan.files.join(", ")}`,
        `Approach: ${input.plan.approach}`,
        `Reasoning: ${input.plan.reasoning}`,
        "Use exact lines from the Repo context snippets as unified diff context lines.",
      ]
    : [];
  // trackedFiles (from git ls-files) is the authoritative path source.
  // Fall back to RAG-returned paths only when trackedFiles is not provided.
  const fileList = input.trackedFiles?.length
    ? input.trackedFiles.map((p) => `  - ${p}`).join("\n")
    : input.repoContext.map((c) => `  - ${c.path}`).join("\n");
  const availableFilesSection = [
    "",
    "Available Files (your diff MUST only reference paths from this list):",
    fileList || "  (none available)",
  ];
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
    "- diff paths MUST come from the Available Files list below — do NOT invent paths.",
    ...strictRules,
    ...planSection,
    ...availableFilesSection,
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
  trackedFiles?: string[];
  currentFiles?: Array<{ path: string; content: string }>;
}): string {
  // trackedFiles (from git ls-files) is the authoritative path source.
  // Fall back to RAG-returned paths only when trackedFiles is not provided.
  const fileList = input.trackedFiles?.length
    ? input.trackedFiles.map((p) => `  - ${p}`).join("\n")
    : input.repoContext.map((c) => `  - ${c.path}`).join("\n");
  const parts = [
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
    "- Provide the COMPLETE corrected file content for each file in `files` — do NOT truncate.",
    "- Preserve all imports, structure, and logic outside the buggy section.",
    "- Keep the change minimal and focused on the incident.",
    "- Do not modify secrets or environment files.",
    "- file paths MUST come from the Available Files list below — do NOT invent paths.",
    "",
    "Available Files (your files array MUST only reference paths from this list):",
    fileList || "  (none available)",
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
  ];

  if (input.currentFiles?.length) {
    parts.push(
      "",
      "Current file contents (output a corrected version of each file below — keep ALL unchanged lines):",
      JSON.stringify(input.currentFiles, null, 2)
    );
  } else {
    parts.push(
      "",
      "Repo context snippets:",
      JSON.stringify(
        input.repoContext.map((item) => ({
          path: item.path,
          content: item.content,
        })),
        null,
        2
      )
    );
  }

  return parts.join("\n");
}

function buildFixabilityPrompt(input: {
  incident: Incident;
  repoContext: Array<{ path: string; content: string }>;
}): string {
  return [
    "You are an SRE assessing whether an incident can be fixed automatically with a code change.",
    "Return JSON only with this exact schema:",
    "{",
    '  "fixability_score": 0.0,  // 0-1: how confident you are a safe, minimal code fix is feasible',
    '  "reason": "string"',
    "}",
    "",
    "Rules:",
    "- Output valid JSON only (no markdown).",
    "- fixability_score: 0 = not fixable or too risky, 1 = high confidence a small code change will fix it.",
    "- Consider: do we have enough repo context? Is the root cause likely in code we can change?",
    "",
    "Incident:",
    JSON.stringify(
      {
        title: input.incident.title,
        severity: input.incident.severity,
        evidence: input.incident.evidence.slice(0, 5),
      },
      null,
      2
    ),
    "",
    "Repo context (path + first 120 chars of content):",
    JSON.stringify(
      input.repoContext.map((c) => ({
        path: c.path,
        preview: c.content.slice(0, 120).replace(/\s+/g, " ").trim(),
      }))
    ),
  ].join("\n");
}

export async function assessFixability(input: {
  incident: Incident;
  repoContext: Array<{ path: string; content: string }>;
}): Promise<FixabilityAssessment | null> {
  const resolved = resolvedProvider();
  if (!resolved) return null;
  try {
    const raw = await callLlm(buildFixabilityPrompt(input), resolved, {
      maxTokens: 256,
      temperature: 0.1,
    });
    return FixabilitySchema.parse(JSON.parse(extractJson(raw)));
  } catch (error) {
    logger.warn("Fixability assessment failed", { error: String(error) });
    return null;
  }
}

export async function generateFixProposal(input: {
  incident: Incident;
  repoContext: Array<{ path: string; content: string }>;
  strictDiff?: boolean;
  plan?: FixPlan;
  trackedFiles?: string[];
}): Promise<FixProposal | null> {
  const resolved = resolvedProvider();
  if (!resolved) {
    logger.info("Fix proposal skipped (no provider/api key configured)");
    return null;
  }
  try {
    const raw = await callLlm(buildFixPrompt(input), resolved, {
      maxTokens: 1024,
      temperature: 0.2,
    });
    return FixSchema.parse(JSON.parse(extractJson(raw)));
  } catch (error) {
    logger.warn("Fix proposal failed", { error: String(error) });
    return null;
  }
}

export async function generateFixRewrite(input: {
  incident: Incident;
  repoContext: Array<{ path: string; content: string }>;
  trackedFiles?: string[];
  currentFiles?: Array<{ path: string; content: string }>;
}): Promise<FixRewrite | null> {
  const resolved = resolvedProvider();
  if (!resolved) {
    logger.info("Fix rewrite skipped (no provider/api key configured)");
    return null;
  }
  try {
    const raw = await callLlm(buildFixRewritePrompt(input), resolved, {
      // Higher token budget: the LLM must output the complete corrected file(s).
      maxTokens: 4096,
      temperature: 0.2,
    });
    return FixRewriteSchema.parse(JSON.parse(extractJson(raw)));
  } catch (error) {
    logger.warn("Fix rewrite failed", { error: String(error) });
    return null;
  }
}

function buildFixPlanPrompt(input: {
  incident: Incident;
  repoContext: Array<{ path: string; content: string }>;
  trackedFiles?: string[];
}): string {
  // trackedFiles (from git ls-files) is the authoritative path source.
  // Fall back to RAG-returned paths only when trackedFiles is not provided.
  const fileList = input.trackedFiles?.length
    ? input.trackedFiles.map((p) => `  - ${p}`).join("\n")
    : input.repoContext.map((c) => `  - ${c.path}`).join("\n");
  const availableFiles = fileList;
  return [
    "You are a senior engineer planning a targeted code fix for a production incident.",
    "Identify which files to modify and describe the specific change needed.",
    "Return JSON only with this exact schema:",
    "{",
    '  "files": ["path/to/file.ts"],  // files to modify — MUST be from Available Files below',
    '  "approach": "string",           // specific change to make (reference file names/functions)',
    '  "reasoning": "string"           // root cause and why this change fixes the incident',
    "}",
    "",
    "Rules:",
    "- Output valid JSON only (no markdown).",
    "- files MUST only contain paths from the Available Files list below.",
    "- Keep to the minimum files necessary (prefer 1-2 files).",
    "",
    "Incident:",
    JSON.stringify(
      {
        title: input.incident.title,
        severity: input.incident.severity,
        evidence: input.incident.evidence.slice(0, 5),
      },
      null,
      2,
    ),
    "",
    "Available Files (select ONLY from these):",
    availableFiles || "  (none available)",
    "",
    "File Content Snippets:",
    JSON.stringify(
      input.repoContext.map((c) => ({
        path: c.path,
        snippet: c.content.slice(0, 400).trimEnd(),
      })),
      null,
      2,
    ),
  ].join("\n");
}

function buildFixVerifyPrompt(input: {
  incident: Incident;
  plan: FixPlan;
  diff: string;
}): string {
  return [
    "You are a senior engineer reviewing a generated code patch for a production incident.",
    "Assess whether the diff correctly and safely implements the stated plan.",
    "Return JSON only with this exact schema:",
    "{",
    '  "valid": true,           // does the diff correctly and safely implement the plan?',
    '  "confidence": 0.9,       // 0-1: how certain are you?',
    '  "issues": ["string"],    // problems found (empty array if none)',
    '  "verdict": "string"      // one-sentence assessment',
    "}",
    "",
    "Rules:",
    "- Output valid JSON only (no markdown).",
    "- valid=false if diff modifies wrong files, logic is unrelated to incident, or change is unsafe.",
    "- Use confidence >= 0.8 only if you are quite certain.",
    "",
    "Incident:",
    JSON.stringify(
      { title: input.incident.title, severity: input.incident.severity },
      null,
      2,
    ),
    "",
    "Plan:",
    JSON.stringify(
      {
        targetFiles: input.plan.files,
        approach: input.plan.approach,
        reasoning: input.plan.reasoning,
      },
      null,
      2,
    ),
    "",
    "Generated Diff:",
    input.diff.length > 4000 ? `${input.diff.slice(0, 4000)}…` : input.diff,
  ].join("\n");
}

export async function generateFixPlan(input: {
  incident: Incident;
  repoContext: Array<{ path: string; content: string }>;
  trackedFiles?: string[];
}): Promise<FixPlan | null> {
  const resolved = resolvedProvider();
  if (!resolved) return null;
  try {
    const raw = await callLlm(buildFixPlanPrompt(input), resolved, {
      maxTokens: 512,
      temperature: 0.1,
    });
    return FixPlanSchema.parse(JSON.parse(extractJson(raw)));
  } catch (error) {
    logger.warn("Fix plan generation failed", { error: String(error) });
    return null;
  }
}

export async function verifyFixPatch(input: {
  incident: Incident;
  plan: FixPlan;
  diff: string;
}): Promise<FixVerify | null> {
  const resolved = resolvedProvider();
  if (!resolved) return null;
  try {
    const raw = await callLlm(buildFixVerifyPrompt(input), resolved, {
      maxTokens: 512,
      temperature: 0.1,
    });
    return FixVerifySchema.parse(JSON.parse(extractJson(raw)));
  } catch (error) {
    logger.warn("Fix verification failed", { error: String(error) });
    return null;
  }
}

export const __test__ = {
  extractJson,
  resolveProvider,
  SummarySchema,
  FixSchema,
  FixPlanSchema,
  FixVerifySchema,
  FixRewriteSchema,
  FixabilitySchema,
};
