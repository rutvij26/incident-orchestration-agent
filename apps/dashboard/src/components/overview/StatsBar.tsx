import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, GitPullRequest, Wrench, Clock } from "lucide-react";

interface Stats {
  totalIncidents: number;
  openIssues: number;
  fixesAttempted: number;
  lastScan: string | null;
  lastScanStatus: string | null;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function StatsBar({ stats }: { stats: Stats }) {
  const cards = [
    {
      title: "Total Incidents",
      value: stats.totalIncidents,
      icon: AlertTriangle,
      color: "text-orange-400",
    },
    {
      title: "Open Issues",
      value: stats.openIssues,
      icon: AlertTriangle,
      color: "text-red-400",
    },
    {
      title: "Fixes Attempted",
      value: stats.fixesAttempted,
      icon: Wrench,
      color: "text-indigo-400",
    },
    {
      title: "Last Scan",
      value: formatRelativeTime(stats.lastScan),
      icon: Clock,
      color: "text-zinc-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map(({ title, value, icon: Icon, color }) => (
        <Card key={title} className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-zinc-400">
              {title}
            </CardTitle>
            <Icon className={`h-4 w-4 ${color}`} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-zinc-100">{value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
