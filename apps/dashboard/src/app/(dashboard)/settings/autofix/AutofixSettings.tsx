"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsForm } from "@/components/settings/SettingsForm";

export function AutofixSettings({
  initialMode, initialSeverity, initialBranchPrefix, initialTestCommand,
}: {
  initialMode: string;
  initialSeverity: string;
  initialBranchPrefix: string;
  initialTestCommand: string;
}) {
  const [mode, setMode] = useState(initialMode || "off");
  const [severity, setSeverity] = useState(initialSeverity || "high");
  const [branchPrefix, setBranchPrefix] = useState(initialBranchPrefix || "autofix/");
  const [testCommand, setTestCommand] = useState(initialTestCommand || "npm test");

  return (
    <SettingsForm
      group="autofix"
      getValues={() => [
        { key: "AUTO_FIX_MODE", value: mode },
        { key: "AUTO_FIX_SEVERITY", value: severity },
        { key: "AUTO_FIX_BRANCH_PREFIX", value: branchPrefix },
        { key: "AUTO_FIX_TEST_COMMAND", value: testCommand },
      ]}
    >
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Auto-fix Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                <SelectItem value="off" className="text-zinc-100 focus:bg-zinc-700">off</SelectItem>
                <SelectItem value="pr" className="text-zinc-100 focus:bg-zinc-700">pr — create PRs automatically</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Minimum Severity</Label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="bg-zinc-800 border-zinc-700 text-zinc-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {["low", "medium", "high", "critical", "all"].map((v) => (
                  <SelectItem key={v} value={v} className="text-zinc-100 focus:bg-zinc-700">{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Branch Prefix</Label>
            <Input value={branchPrefix} onChange={(e) => setBranchPrefix(e.target.value)}
              className="bg-zinc-800 border-zinc-700 text-zinc-100" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-zinc-300">Test Command</Label>
            <Input value={testCommand} onChange={(e) => setTestCommand(e.target.value)}
              placeholder="npm test" className="bg-zinc-800 border-zinc-700 text-zinc-100 font-mono text-sm" />
          </div>
        </CardContent>
      </Card>
    </SettingsForm>
  );
}
