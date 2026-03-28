"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

export function OverviewRefresher() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const lastRefreshRef = useRef<number>(0);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRefreshRef.current < 10_000) return;
      lastRefreshRef.current = now;
      startTransition(() => router.refresh());
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [router, startTransition]);

  return null;
}
