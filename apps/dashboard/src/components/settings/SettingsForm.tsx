"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { ConfigGroup } from "@agentic/shared";

interface SettingsFormProps {
  group: ConfigGroup;
  children: React.ReactNode;
  getValues: () => Array<{ key: string; value: string; sensitive?: boolean }>;
}

export function SettingsForm({ group, children, getValues }: SettingsFormProps) {
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/config/${group}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(getValues()),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "Failed to save settings");
        return;
      }
      toast.success("Settings saved");
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {children}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Save changes
        </Button>
      </div>
    </div>
  );
}
