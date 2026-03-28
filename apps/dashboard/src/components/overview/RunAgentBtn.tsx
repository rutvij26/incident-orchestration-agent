"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Play, Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

type RunState = "idle" | "running" | "ok" | "error";

interface WorkflowRunRow {
  status: string;
}

export function RunAgentBtn() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, setState] = useState<RunState>("idle");
  const [message, setMessage] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  async function pollUntilDone(signal: AbortSignal) {
    const deadline = Date.now() + 120_000;

    while (Date.now() < deadline) {
      if (signal.aborted) return;
      await new Promise((r) => setTimeout(r, 3000));
      if (signal.aborted) return;

      try {
        const res = await fetch("/api/overview/agent", {
          cache: "no-store",
          signal,
        });
        if (!res.ok) continue;
        const run = (await res.json()) as WorkflowRunRow | null;
        if (!run) continue;

        if (run.status === "completed" || run.status === "failed") {
          setState(run.status === "completed" ? "ok" : "error");
          setMessage(run.status === "completed" ? "Run completed" : "Run failed");
          startTransition(() => router.refresh());
          setTimeout(() => setState("idle"), 5000);
          return;
        }
      } catch {
        if (signal.aborted) return;
      }
    }

    // Timeout
    setState("error");
    setMessage("Timed out waiting for run");
    startTransition(() => router.refresh());
    setTimeout(() => setState("idle"), 5000);
  }

  async function handleRun() {
    if (state === "running") return;
    setState("running");
    setMessage("");

    try {
      const res = await fetch("/api/agent/run", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; error?: string; workflowId?: string };

      if (res.status === 409) {
        setState("error");
        setMessage("Already running");
        toast.error("A workflow run is already in progress.");
        setTimeout(() => setState("idle"), 5000);
        return;
      }

      if (!data.ok) {
        setState("error");
        setMessage(data.error ?? "Failed to start");
        toast.error(data.error ?? "Failed to start workflow");
        setTimeout(() => setState("idle"), 5000);
        return;
      }

      // Workflow started — refresh immediately to show "running" state
      startTransition(() => router.refresh());

      const abort = new AbortController();
      abortRef.current = abort;
      pollUntilDone(abort.signal);
    } catch (err) {
      setState("error");
      setMessage(String(err));
      setTimeout(() => setState("idle"), 5000);
    }
  }

  const isRunning = state === "running";

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleRun}
        disabled={isRunning}
        className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1.5"
      >
        {isRunning ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Play className="h-3 w-3" />
        )}
        {isRunning ? "Running…" : "Run now"}
      </Button>
      {state === "ok" && (
        <span className="flex items-center gap-1 text-xs text-green-400">
          <CheckCircle className="h-3.5 w-3.5" /> {message}
        </span>
      )}
      {state === "error" && (
        <span className="flex items-center gap-1 text-xs text-red-400">
          <XCircle className="h-3.5 w-3.5" /> {message}
        </span>
      )}
    </div>
  );
}
