"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

interface TestConnectionBtnProps {
  configKey: string;
  getValue: () => string;
}

export function TestConnectionBtn({ configKey, getValue }: TestConnectionBtnProps) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleTest() {
    const value = getValue();
    if (!value) {
      setState("error");
      setMessage("Enter a value first");
      setTimeout(() => setState("idle"), 5000);
      return;
    }
    setState("loading");
    try {
      const res = await fetch("/api/config/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: configKey, value }),
      });
      const data = (await res.json()) as { ok: boolean; message: string };
      setState(data.ok ? "ok" : "error");
      setMessage(data.message);
    } catch (err) {
      setState("error");
      setMessage(String(err));
    }
    setTimeout(() => setState("idle"), 5000);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleTest}
        disabled={state === "loading"}
        className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
      >
        {state === "loading" && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
        Test connection
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
