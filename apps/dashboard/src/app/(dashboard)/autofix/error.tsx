"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AutofixError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[400px] gap-4">
      <AlertTriangle className="h-10 w-10 text-red-400" />
      <div className="text-center">
        <h2 className="text-lg font-semibold text-zinc-100">Failed to load auto-fix data</h2>
        <p className="text-sm text-zinc-500 mt-1">{error.message}</p>
        {error.digest && (
          <p className="text-xs text-zinc-600 mt-1">Error ID: {error.digest}</p>
        )}
      </div>
      <Button
        onClick={reset}
        variant="outline"
        className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
      >
        Try again
      </Button>
    </div>
  );
}
