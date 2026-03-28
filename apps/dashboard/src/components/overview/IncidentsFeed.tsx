import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientDate } from "@/components/ui/ClientDate";

interface Incident {
  id: string;
  title: string;
  severity: string;
  status: string | null;
  issue_url: string | null;
  created_at: string | null;
  last_seen: string | null;
}

const severityColors: Record<string, string> = {
  critical: "bg-red-900 text-red-300 border-red-800",
  high: "bg-orange-900 text-orange-300 border-orange-800",
  medium: "bg-yellow-900 text-yellow-300 border-yellow-800",
  low: "bg-blue-900 text-blue-300 border-blue-800",
};

export function IncidentsFeed({ incidents }: { incidents: Incident[] }) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-zinc-400">
          Recent Incidents
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {incidents.length === 0 ? (
          <p className="px-6 py-4 text-sm text-zinc-500">No incidents yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-500">Severity</TableHead>
                <TableHead className="text-zinc-500">Title</TableHead>
                <TableHead className="text-zinc-500">Status</TableHead>
                <TableHead className="text-zinc-500">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incidents.map((inc) => (
                <TableRow key={inc.id} className="border-zinc-800 hover:bg-zinc-800/50">
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${severityColors[inc.severity] ?? "bg-zinc-800 text-zinc-400"}`}
                    >
                      {inc.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-zinc-200">
                    {inc.issue_url ? (
                      <a
                        href={inc.issue_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-indigo-400 underline-offset-2 hover:underline"
                      >
                        {inc.title}
                      </a>
                    ) : (
                      inc.title
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-zinc-400">
                      {inc.status ?? "open"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-500">
                    <ClientDate value={inc.created_at ?? inc.last_seen} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
