"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsForm } from "@/components/settings/SettingsForm";

export function AdvancedSettings({
  temporalAddress,
  initialOtelEndpoint,
}: {
  temporalAddress: string;
  initialOtelEndpoint: string;
}) {
  const [otelEndpoint, setOtelEndpoint] = useState(initialOtelEndpoint);

  return (
    <SettingsForm
      group="bootstrap"
      getValues={() => [
        { key: "OTEL_EXPORTER_OTLP_ENDPOINT", value: otelEndpoint },
      ]}
    >
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Temporal Address</Label>
            <Input value={temporalAddress} disabled
              className="bg-zinc-800/50 border-zinc-700 text-zinc-500 cursor-not-allowed" />
            <p className="text-xs text-zinc-600">Set via TEMPORAL_ADDRESS env var — read-only.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">OTLP Endpoint</Label>
            <Input value={otelEndpoint} onChange={(e) => setOtelEndpoint(e.target.value)}
              placeholder="http://otel-collector:4318"
              className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder:text-zinc-500" />
          </div>
        </CardContent>
      </Card>
    </SettingsForm>
  );
}
