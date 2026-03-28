"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsForm } from "@/components/settings/SettingsForm";

export function RagSettings({
  initialRepoUrl, initialTopK, initialMinScore, initialChunkSize,
}: {
  initialRepoUrl: string;
  initialTopK: string;
  initialMinScore: string;
  initialChunkSize: string;
}) {
  const [repoUrl, setRepoUrl] = useState(initialRepoUrl);
  const [topK, setTopK] = useState(initialTopK || "6");
  const [minScore, setMinScore] = useState(initialMinScore || "0.2");
  const [chunkSize, setChunkSize] = useState(initialChunkSize || "900");

  return (
    <SettingsForm
      group="rag"
      getValues={() => [
        { key: "REPO_URL", value: repoUrl },
        { key: "RAG_TOP_K", value: topK },
        { key: "RAG_MIN_SCORE", value: minScore },
        { key: "RAG_CHUNK_SIZE", value: chunkSize },
      ]}
    >
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Repository URL</Label>
            <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-xs">Top K</Label>
              <Input value={topK} onChange={(e) => setTopK(e.target.value)}
                type="number" min="1" max="20"
                className="bg-zinc-800 border-zinc-700 text-zinc-100" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-xs">Min Score</Label>
              <Input value={minScore} onChange={(e) => setMinScore(e.target.value)}
                type="number" min="0" max="1" step="0.05"
                className="bg-zinc-800 border-zinc-700 text-zinc-100" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-zinc-300 text-xs">Chunk Size</Label>
              <Input value={chunkSize} onChange={(e) => setChunkSize(e.target.value)}
                type="number" min="100" step="50"
                className="bg-zinc-800 border-zinc-700 text-zinc-100" />
            </div>
          </div>
        </CardContent>
      </Card>
    </SettingsForm>
  );
}
