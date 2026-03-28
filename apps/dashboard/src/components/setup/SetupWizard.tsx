"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { MaskedInput } from "@/components/settings/MaskedInput";
import { TestConnectionBtn } from "@/components/settings/TestConnectionBtn";
import type { ConfigGroup } from "@agentic/shared";

const STEPS = ["LLM Provider", "GitHub", "Loki", "RAG Repo"];

type FormData = {
  llmProvider: "openai" | "anthropic" | "gemini";
  openaiKey: string;
  anthropicKey: string;
  geminiKey: string;
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  lokiUrl: string;
  repoUrl: string;
};

function getStepError(step: number, form: FormData): string | null {
  if (step === 0) {
    const key =
      form.llmProvider === "openai"
        ? form.openaiKey
        : form.llmProvider === "anthropic"
          ? form.anthropicKey
          : form.geminiKey;
    if (!key.trim()) return "Please enter an API key for your selected provider.";
  }
  if (step === 1) {
    if (!form.githubToken.trim()) return "GitHub token is required.";
    if (!form.githubOwner.trim()) return "GitHub owner is required.";
    if (!form.githubRepo.trim()) return "GitHub repository is required.";
  }
  if (step === 2) {
    if (!form.lokiUrl.trim()) return "Loki URL is required.";
  }
  return null;
}

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    llmProvider: "anthropic",
    openaiKey: "",
    anthropicKey: "",
    geminiKey: "",
    githubToken: "",
    githubOwner: "",
    githubRepo: "",
    lokiUrl: "http://loki:3100",
    repoUrl: "",
  });

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setStepError(null);
  }

  function handleNext() {
    const err = getStepError(step, form);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setStep((s) => s + 1);
  }

  async function finish() {
    const err = getStepError(step, form);
    if (err) {
      setStepError(err);
      return;
    }
    setSaving(true);
    try {
      const records: Array<{ key: string; value: string; group: ConfigGroup; sensitive?: boolean }> = [
        { key: "LLM_PROVIDER", value: form.llmProvider, group: "llm" },
        { key: "OPENAI_API_KEY", value: form.openaiKey, group: "llm", sensitive: true },
        { key: "ANTHROPIC_API_KEY", value: form.anthropicKey, group: "llm", sensitive: true },
        { key: "GEMINI_API_KEY", value: form.geminiKey, group: "llm", sensitive: true },
        { key: "GITHUB_TOKEN", value: form.githubToken, group: "github", sensitive: true },
        { key: "GITHUB_OWNER", value: form.githubOwner, group: "github" },
        { key: "GITHUB_REPO", value: form.githubRepo, group: "github" },
        { key: "LOKI_URL", value: form.lokiUrl, group: "source" },
        { key: "SOURCE_CONNECTORS", value: "loki", group: "source" },
      ];
      if (form.repoUrl) {
        records.push({ key: "REPO_URL", value: form.repoUrl, group: "rag" });
      }

      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(records.filter((r) => r.value)),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Failed to save configuration. Please try again.");
        return;
      }

      router.push("/overview");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  const activeApiKey =
    form.llmProvider === "openai"
      ? form.openaiKey
      : form.llmProvider === "anthropic"
        ? form.anthropicKey
        : form.geminiKey;
  const activeApiKeyName =
    form.llmProvider === "openai"
      ? "OPENAI_API_KEY"
      : form.llmProvider === "anthropic"
        ? "ANTHROPIC_API_KEY"
        : "GEMINI_API_KEY";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-100">Welcome to Agentic</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Configure your SRE agent in 4 steps
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-zinc-500">
            <span>Step {step + 1} of {STEPS.length}</span>
            <span>{STEPS[step]}</span>
          </div>
          <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5 bg-zinc-800" />
        </div>

        {/* Step 0 — LLM */}
        {step === 0 && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">LLM Provider</CardTitle>
              <CardDescription className="text-zinc-500">
                Choose your AI provider and enter your API key.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                {(["anthropic", "openai", "gemini"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => set("llmProvider", p)}
                    className={`flex-1 rounded-md border py-2 text-sm capitalize transition-colors ${
                      form.llmProvider === p
                        ? "border-indigo-500 bg-indigo-900/40 text-indigo-300"
                        : "border-zinc-700 text-zinc-400 hover:border-zinc-600"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-300">API Key</Label>
                <MaskedInput
                  value={activeApiKey}
                  onChange={(v) =>
                    set(
                      form.llmProvider === "openai"
                        ? "openaiKey"
                        : form.llmProvider === "anthropic"
                          ? "anthropicKey"
                          : "geminiKey",
                      v
                    )
                  }
                  placeholder="sk-..."
                />
              </div>
              <TestConnectionBtn
                configKey={activeApiKeyName}
                getValue={() => activeApiKey}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 1 — GitHub */}
        {step === 1 && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">GitHub</CardTitle>
              <CardDescription className="text-zinc-500">
                Required to create issues and PRs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Personal Access Token</Label>
                <MaskedInput
                  value={form.githubToken}
                  onChange={(v) => set("githubToken", v)}
                  placeholder="ghp_..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-zinc-300">Owner</Label>
                  <Input
                    value={form.githubOwner}
                    onChange={(e) => set("githubOwner", e.target.value)}
                    placeholder="your-org"
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-zinc-300">Repository</Label>
                  <Input
                    value={form.githubRepo}
                    onChange={(e) => set("githubRepo", e.target.value)}
                    placeholder="your-repo"
                    className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                  />
                </div>
              </div>
              <TestConnectionBtn
                configKey="GITHUB_TOKEN"
                getValue={() => form.githubToken}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 2 — Loki */}
        {step === 2 && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">Loki Log Source</CardTitle>
              <CardDescription className="text-zinc-500">
                The Loki URL the agent will query for logs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Loki URL</Label>
                <Input
                  value={form.lokiUrl}
                  onChange={(e) => set("lokiUrl", e.target.value)}
                  placeholder="http://loki:3100"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
              <TestConnectionBtn
                configKey="LOKI_URL"
                getValue={() => form.lokiUrl}
              />
            </CardContent>
          </Card>
        )}

        {/* Step 3 — RAG */}
        {step === 3 && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-zinc-100">RAG Repository</CardTitle>
              <CardDescription className="text-zinc-500">
                Optional — enables code-aware auto-fix suggestions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-zinc-300">Repository URL</Label>
                <Input
                  value={form.repoUrl}
                  onChange={(e) => set("repoUrl", e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
                />
              </div>
              <p className="text-xs text-zinc-500">
                Leave blank to skip. You can configure this later in Settings → RAG.
              </p>
            </CardContent>
          </Card>
        )}

        {stepError && (
          <p className="text-sm text-red-400 text-center">{stepError}</p>
        )}

        <div className="flex justify-between">
          <Button
            variant="ghost"
            onClick={() => { setStepError(null); setStep((s) => s - 1); }}
            disabled={step === 0}
            className="text-zinc-400 hover:text-zinc-100"
          >
            Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button
              onClick={handleNext}
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              Next
            </Button>
          ) : (
            <Button
              onClick={finish}
              disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              {saving ? "Saving…" : "Finish setup"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
