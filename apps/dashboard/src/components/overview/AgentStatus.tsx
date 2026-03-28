import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Loader2 } from "lucide-react";
import { ClientDate } from "@/components/ui/ClientDate";

interface WorkflowRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  logs_scanned: number;
  incidents_found: number;
  issues_opened: number;
  fixes_attempted: number;
  error_message: string | null;
}

const statusStyles: Record<string, string> = {
  completed: "bg-green-900 text-green-300 border-green-800",
  running: "bg-indigo-900 text-indigo-300 border-indigo-800",
  failed: "bg-red-900 text-red-300 border-red-800",
};

export function AgentStatus({
  run,
  action,
}: {
  run: WorkflowRun | null;
  action?: React.ReactNode;
}) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-zinc-400">
          Agent Status
        </CardTitle>
        <div className="flex items-center gap-2">
          {action}
          <Activity className="h-4 w-4 text-zinc-500" />
        </div>
      </CardHeader>
      <CardContent aria-live="polite">
        {!run ? (
          <p className="text-sm text-zinc-500">No runs yet.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={statusStyles[run.status] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"}
              >
                {run.status === "running" && (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                )}
                {run.status}
              </Badge>
              <span className="text-xs text-zinc-500">
                <ClientDate value={run.started_at} />
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
              <span>Logs scanned: <strong className="text-zinc-200">{run.logs_scanned ?? 0}</strong></span>
              <span>Incidents: <strong className="text-zinc-200">{run.incidents_found ?? 0}</strong></span>
              <span>Issues opened: <strong className="text-zinc-200">{run.issues_opened ?? 0}</strong></span>
              <span>Fixes: <strong className="text-zinc-200">{run.fixes_attempted ?? 0}</strong></span>
            </div>
            {run.error_message && (
              <p className="text-xs text-red-400 truncate">{run.error_message}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
