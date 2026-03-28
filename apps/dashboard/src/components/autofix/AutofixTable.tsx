"use client";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { GitPullRequest, CheckCircle, XCircle, Minus, Wrench } from "lucide-react";
import { ClientDate } from "@/components/ui/ClientDate";
import type { AutofixRow } from "@/lib/queries/autofix";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-900 text-red-300 border-red-800",
  high: "bg-orange-900 text-orange-300 border-orange-800",
  medium: "bg-yellow-900 text-yellow-300 border-yellow-800",
  low: "bg-blue-900 text-blue-300 border-blue-800",
};

const OUTCOME_STYLES: Record<string, string> = {
  pr_created: "bg-green-900 text-green-300 border-green-800",
  failed: "bg-red-900 text-red-300 border-red-800",
  skipped: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const OUTCOME_LABELS: Record<string, string> = {
  pr_created: "PR created",
  failed: "failed",
  skipped: "skipped",
};

function TestStatusIcon({ value }: { value: boolean | null }) {
  if (value === true) return <CheckCircle className="h-4 w-4 text-green-400" aria-label="Tests passed" />;
  if (value === false) return <XCircle className="h-4 w-4 text-red-400" aria-label="Tests failed" />;
  return <Minus className="h-4 w-4 text-zinc-600" aria-label="Not tested" />;
}

interface Props {
  data: AutofixRow[];
}

export function AutofixTable({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-500">
        <Wrench className="h-8 w-8" />
        <p className="text-sm">No auto-fix attempts yet.</p>
        <p className="text-xs text-zinc-600">
          Enable auto-fix in Settings → Auto-fix.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableCaption className="sr-only">Auto-fix attempts ordered by date</TableCaption>
      <TableHeader>
        <TableRow className="border-zinc-800 hover:bg-transparent">
          <TableHead className="text-zinc-500">Incident</TableHead>
          <TableHead className="text-zinc-500">Outcome</TableHead>
          <TableHead className="text-zinc-500">PR</TableHead>
          <TableHead className="text-zinc-500 text-center">Tests</TableHead>
          <TableHead className="text-zinc-500">Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow key={row.id} className="border-zinc-800 hover:bg-zinc-800/50">
            <TableCell>
              <div className="flex items-center gap-2 min-w-0">
                <Badge
                  variant="outline"
                  className={`text-xs shrink-0 ${SEVERITY_COLORS[row.incident_severity] ?? "bg-zinc-800 text-zinc-400"}`}
                >
                  {row.incident_severity}
                </Badge>
                <span className="text-zinc-200 text-sm truncate max-w-[200px]">
                  {row.incident_title}
                </span>
              </div>
            </TableCell>
            <TableCell>
              <Badge
                variant="outline"
                className={`text-xs ${OUTCOME_STYLES[row.outcome] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}`}
              >
                {OUTCOME_LABELS[row.outcome] ?? row.outcome}
              </Badge>
              {row.reason && (
                <p className="text-xs text-zinc-500 mt-1 max-w-[160px] truncate" title={row.reason}>
                  {row.reason}
                </p>
              )}
            </TableCell>
            <TableCell>
              {row.pr_url ? (
                <a
                  href={row.pr_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 text-xs hover:underline"
                >
                  <GitPullRequest className="h-3.5 w-3.5" />
                  View PR
                </a>
              ) : (
                <span className="text-zinc-600 text-xs">—</span>
              )}
            </TableCell>
            <TableCell className="text-center">
              <TestStatusIcon value={row.tests_passed} />
            </TableCell>
            <TableCell className="text-xs text-zinc-500">
              <ClientDate value={row.created_at} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
