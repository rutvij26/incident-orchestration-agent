"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { Card, CardContent } from "@/components/ui/card";

export function GeneralSettings({
  initialSourceConnectors,
  initialEscalateFrom,
}: {
  initialSourceConnectors: string;
  initialEscalateFrom: string;
}) {
  const [sourceConnectors, setSourceConnectors] = useState(initialSourceConnectors || "loki");
  const [escalateFrom, setEscalateFrom] = useState(initialEscalateFrom || "high");

  return (
    <SettingsForm
      group="source"
      getValues={() => [
        { key: "SOURCE_CONNECTORS", value: sourceConnectors },
        { key: "AUTO_ESCALATE_FROM", value: escalateFrom },
      ]}
    >
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Source Connectors</Label>
            <Input
              value={sourceConnectors}
              onChange={(e) => setSourceConnectors(e.target.value)}
              placeholder="loki"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500"
            />
            <p className="text-xs text-zinc-500">Comma-separated list (e.g. loki)</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Auto-escalate from severity</Label>
            <Select value={escalateFrom} onValueChange={setEscalateFrom}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {["low", "medium", "high", "critical", "none"].map((v) => (
                  <SelectItem key={v} value={v} className="text-zinc-100 focus:bg-zinc-700">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
    </SettingsForm>
  );
}
