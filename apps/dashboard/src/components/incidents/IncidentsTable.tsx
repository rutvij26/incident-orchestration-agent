"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { ClientDate } from "@/components/ui/ClientDate";
import type { IncidentRow } from "@/lib/queries/incidents";
import type { IncidentStatus } from "@agentic/shared";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-900 text-red-300 border-red-800",
  high: "bg-orange-900 text-orange-300 border-orange-800",
  medium: "bg-yellow-900 text-yellow-300 border-yellow-800",
  low: "bg-blue-900 text-blue-300 border-blue-800",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-red-900/40 text-red-300 border-red-800 hover:bg-red-900/70",
  acknowledged: "bg-yellow-900/40 text-yellow-300 border-yellow-800 hover:bg-yellow-900/70",
  resolved: "bg-green-900/40 text-green-300 border-green-800 hover:bg-green-900/70",
};

const STATUS_CYCLE: Record<string, IncidentStatus> = {
  open: "acknowledged",
  acknowledged: "resolved",
  resolved: "open",
};

const FILTER_TABS: Array<{ label: string; value: string }> = [
  { label: "All", value: "" },
  { label: "Open", value: "open" },
  { label: "Acknowledged", value: "acknowledged" },
  { label: "Resolved", value: "resolved" },
];

interface Props {
  initialData: IncidentRow[];
  initialNextCursor: string | null;
  initialStatus: string;
}

export function IncidentsTable({ initialData, initialNextCursor, initialStatus }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [incidents, setIncidents] = useState(initialData);
  const [nextCursor] = useState(initialNextCursor);

  const setStatusFilter = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set("status", value);
      } else {
        params.delete("status");
      }
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
  );

  async function handleStatusClick(id: string, currentStatus: string) {
    const nextStatus = STATUS_CYCLE[currentStatus] ?? "acknowledged";

    // Optimistic update
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === id ? { ...inc, status: nextStatus } : inc
      )
    );

    try {
      const res = await fetch(`/api/incidents/${id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        // Revert
        setIncidents((prev) =>
          prev.map((inc) =>
            inc.id === id ? { ...inc, status: currentStatus } : inc
          )
        );
      }
    } catch {
      // Revert
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === id ? { ...inc, status: currentStatus } : inc
        )
      );
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-zinc-800 pb-0">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              initialStatus === tab.value
                ? "border-indigo-500 text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-500">
          <AlertTriangle className="h-8 w-8" />
          <p className="text-sm">No incidents found.</p>
          <p className="text-xs text-zinc-600">Run the agent to detect incidents.</p>
        </div>
      ) : (
        <Table>
          <TableCaption className="sr-only">Incidents ordered by date</TableCaption>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-500">Severity</TableHead>
              <TableHead className="text-zinc-500">Title</TableHead>
              <TableHead className="text-zinc-500">Count</TableHead>
              <TableHead className="text-zinc-500">Status</TableHead>
              <TableHead className="text-zinc-500">Last seen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {incidents.map((inc) => {
              const status = inc.status ?? "open";
              return (
                <TableRow key={inc.id} className="border-zinc-800 hover:bg-zinc-800/50">
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${SEVERITY_COLORS[inc.severity] ?? "bg-zinc-800 text-zinc-400"}`}
                    >
                      {inc.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs text-zinc-200">
                    {inc.issue_url ? (
                      <a
                        href={inc.issue_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-indigo-400 underline-offset-2 hover:underline truncate block"
                      >
                        {inc.title}
                      </a>
                    ) : (
                      <span className="truncate block">{inc.title}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400">
                    {inc.event_count}
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => handleStatusClick(inc.id, status)}
                      title="Click to advance status"
                    >
                      <Badge
                        variant="outline"
                        className={`text-xs cursor-pointer transition-colors ${
                          STATUS_STYLES[status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"
                        }`}
                      >
                        {status}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    <ClientDate value={inc.last_seen ?? inc.created_at} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {nextCursor && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            className="border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("cursor", nextCursor);
              router.push(`${pathname}?${params.toString()}`);
            }}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
