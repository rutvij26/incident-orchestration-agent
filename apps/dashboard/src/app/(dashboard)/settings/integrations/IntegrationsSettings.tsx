"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { MaskedInput } from "@/components/settings/MaskedInput";
import { TestConnectionBtn } from "@/components/settings/TestConnectionBtn";

interface Props {
  initialAnthropicKey: string;
  initialAnthropicModel: string;
  initialOpenaiKey: string;
  initialOpenaiModel: string;
  initialGeminiKey: string;
  initialGeminiModel: string;
  initialGithubToken: string;
  initialGithubOwner: string;
  initialGithubRepo: string;
}

export function IntegrationsSettings({
  initialAnthropicKey, initialAnthropicModel,
  initialOpenaiKey, initialOpenaiModel,
  initialGeminiKey, initialGeminiModel,
  initialGithubToken, initialGithubOwner, initialGithubRepo,
}: Props) {
  const [anthropicKey, setAnthropicKey] = useState(initialAnthropicKey);
  const [anthropicModel, setAnthropicModel] = useState(initialAnthropicModel || "claude-sonnet-4-5");
  const [openaiKey, setOpenaiKey] = useState(initialOpenaiKey);
  const [openaiModel, setOpenaiModel] = useState(initialOpenaiModel || "gpt-4o-mini");
  const [geminiKey, setGeminiKey] = useState(initialGeminiKey);
  const [geminiModel, setGeminiModel] = useState(initialGeminiModel || "gemini-1.5-flash");
  const [githubToken, setGithubToken] = useState(initialGithubToken);
  const [githubOwner, setGithubOwner] = useState(initialGithubOwner);
  const [githubRepo, setGithubRepo] = useState(initialGithubRepo);

  return (
    <div className="space-y-8">
      {/* LLM providers */}
      <SettingsForm
        group="llm"
        getValues={() => [
          { key: "ANTHROPIC_API_KEY", value: anthropicKey, sensitive: true },
          { key: "ANTHROPIC_MODEL", value: anthropicModel },
          { key: "OPENAI_API_KEY", value: openaiKey, sensitive: true },
          { key: "OPENAI_MODEL", value: openaiModel },
          { key: "GEMINI_API_KEY", value: geminiKey, sensitive: true },
          { key: "GEMINI_MODEL", value: geminiModel },
        ]}
      >
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader><CardTitle className="text-sm text-zinc-300">Anthropic</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">API Key</Label>
              <MaskedInput value={anthropicKey} onChange={setAnthropicKey} placeholder="sk-ant-..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Model</Label>
              <Input value={anthropicModel} onChange={(e) => setAnthropicModel(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100" />
            </div>
            <TestConnectionBtn configKey="ANTHROPIC_API_KEY" getValue={() => anthropicKey} />
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader><CardTitle className="text-sm text-zinc-300">OpenAI</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">API Key</Label>
              <MaskedInput value={openaiKey} onChange={setOpenaiKey} placeholder="sk-..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Model</Label>
              <Input value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100" />
            </div>
            <TestConnectionBtn configKey="OPENAI_API_KEY" getValue={() => openaiKey} />
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader><CardTitle className="text-sm text-zinc-300">Gemini</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">API Key</Label>
              <MaskedInput value={geminiKey} onChange={setGeminiKey} placeholder="AIza..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Model</Label>
              <Input value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)}
                className="bg-zinc-800 border-zinc-700 text-zinc-100" />
            </div>
            <TestConnectionBtn configKey="GEMINI_API_KEY" getValue={() => geminiKey} />
          </CardContent>
        </Card>
      </SettingsForm>

      <Separator className="bg-zinc-800" />

      {/* GitHub — separate form, separate group */}
      <SettingsForm
        group="github"
        getValues={() => [
          { key: "GITHUB_TOKEN", value: githubToken, sensitive: true },
          { key: "GITHUB_OWNER", value: githubOwner },
          { key: "GITHUB_REPO", value: githubRepo },
        ]}
      >
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader><CardTitle className="text-sm text-zinc-300">GitHub</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-400 text-xs">Personal Access Token</Label>
              <MaskedInput value={githubToken} onChange={setGithubToken} placeholder="ghp_..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Owner</Label>
                <Input value={githubOwner} onChange={(e) => setGithubOwner(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-zinc-400 text-xs">Repository</Label>
                <Input value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100" />
              </div>
            </div>
            <TestConnectionBtn configKey="GITHUB_TOKEN" getValue={() => githubToken} />
          </CardContent>
        </Card>
      </SettingsForm>
    </div>
  );
}
