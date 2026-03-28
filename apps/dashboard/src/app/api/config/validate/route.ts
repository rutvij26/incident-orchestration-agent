import { NextRequest, NextResponse } from "next/server";

type ValidationResult = { ok: boolean; message: string };

async function validateAnthropicKey(value: string): Promise<ValidationResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": value,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  });
  if (res.ok || res.status === 400) return { ok: true, message: "Connected" };
  return { ok: false, message: `HTTP ${res.status}` };
}

async function validateOpenAIKey(value: string): Promise<ValidationResult> {
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${value}` },
  });
  if (res.ok) return { ok: true, message: "Connected" };
  return { ok: false, message: `HTTP ${res.status}` };
}

async function validateGeminiKey(value: string): Promise<ValidationResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${value}`
  );
  if (res.ok) return { ok: true, message: "Connected" };
  return { ok: false, message: `HTTP ${res.status}` };
}

async function validateGitHubToken(value: string): Promise<ValidationResult> {
  const res = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${value}` },
  });
  if (res.ok) return { ok: true, message: "Connected" };
  return { ok: false, message: `HTTP ${res.status}` };
}

async function validateLokiUrl(value: string): Promise<ValidationResult> {
  const url = value.replace(/\/$/, "");
  const res = await fetch(`${url}/ready`, { signal: AbortSignal.timeout(5000) });
  if (res.ok) return { ok: true, message: "Connected" };
  return { ok: false, message: `HTTP ${res.status}` };
}

const validators: Record<
  string,
  (value: string) => Promise<ValidationResult>
> = {
  ANTHROPIC_API_KEY: validateAnthropicKey,
  OPENAI_API_KEY: validateOpenAIKey,
  GEMINI_API_KEY: validateGeminiKey,
  GITHUB_TOKEN: validateGitHubToken,
  LOKI_URL: validateLokiUrl,
};

export async function POST(req: NextRequest) {
  try {
    const { key, value } = (await req.json()) as { key: string; value: string };
    const validator = validators[key];
    if (!validator) {
      return NextResponse.json({ ok: false, message: "No validator for this key" });
    }
    const result = await validator(value);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) });
  }
}
