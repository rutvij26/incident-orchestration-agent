import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitPullRequest, Minus } from "lucide-react";
import { ClientDate } from "@/components/ui/ClientDate";

interface PRRecord {
  id: string;
  incident_id: string;
  pr_url: string;
  outcome: string;
  tests_passed: boolean | null;
  plan_summary: string | null;
  created_at: string | null;
}

export function RecentPRs({ prs }: { prs: PRRecord[] }) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-zinc-400">
          Recent Auto-fix PRs
        </CardTitle>
      </CardHeader>
      <CardContent>
        {prs.length === 0 ? (
          <p className="text-sm text-zinc-500">No PRs created yet.</p>
        ) : (
          <ul className="space-y-3">
            {prs.map((pr) => (
              <li key={pr.id} className="flex items-start gap-3">
                <GitPullRequest className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                <div className="min-w-0 flex-1">
                  <a
                    href={pr.pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-zinc-200 hover:text-indigo-400 hover:underline underline-offset-2 truncate block"
                  >
                    {pr.plan_summary ?? pr.pr_url}
                  </a>
                  <div className="mt-1 flex items-center gap-2">
                    {pr.tests_passed === null ? (
                      <Badge
                        variant="outline"
                        className="bg-zinc-800 text-zinc-400 border-zinc-700 text-xs flex items-center gap-1"
                      >
                        <Minus className="h-2.5 w-2.5" /> untested
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={
                          pr.tests_passed
                            ? "bg-green-900 text-green-300 border-green-800 text-xs"
                            : "bg-red-900 text-red-300 border-red-800 text-xs"
                        }
                      >
                        {pr.tests_passed ? "tests passed" : "tests failed"}
                      </Badge>
                    )}
                    {pr.created_at && (
                      <span className="text-xs text-zinc-500">
                        <ClientDate value={pr.created_at} format="date" />
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
