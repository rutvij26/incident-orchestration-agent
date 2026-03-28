"use client";

import { useState, useEffect } from "react";

type DateFormat = "datetime" | "date" | "relative";

interface ClientDateProps {
  value: string | Date | null | undefined;
  format?: DateFormat;
}

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ClientDate({ value, format = "datetime" }: ClientDateProps) {
  const [formatted, setFormatted] = useState<string>("—");

  useEffect(() => {
    if (!value) {
      setFormatted("—");
      return;
    }
    const date = new Date(value);
    switch (format) {
      case "relative":
        setFormatted(formatRelative(date));
        break;
      case "date":
        setFormatted(date.toLocaleDateString());
        break;
      default:
        setFormatted(date.toLocaleString());
    }
  }, [value, format]);

  return <span suppressHydrationWarning>{formatted}</span>;
}
