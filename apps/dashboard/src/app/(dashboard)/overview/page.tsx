export const dynamic = "force-dynamic";

import { StatsBar } from "@/components/overview/StatsBar";
import { IncidentsFeed } from "@/components/overview/IncidentsFeed";
import { RecentPRs } from "@/components/overview/RecentPRs";
import { AgentStatus } from "@/components/overview/AgentStatus";
import { RunAgentBtn } from "@/components/overview/RunAgentBtn";
import { OverviewRefresher } from "@/components/overview/OverviewRefresher";
import {
  getOverviewStats,
  getRecentIncidents,
  getRecentPRs,
  getLatestWorkflowRun,
} from "@/lib/queries/overview";

export default async function OverviewPage() {
  let stats: Awaited<ReturnType<typeof getOverviewStats>>;
  let incidents: Awaited<ReturnType<typeof getRecentIncidents>>;
  let prs: Awaited<ReturnType<typeof getRecentPRs>>;
  let agent: Awaited<ReturnType<typeof getLatestWorkflowRun>>;

  try {
    [stats, incidents, prs, agent] = await Promise.all([
      getOverviewStats(),
      getRecentIncidents(),
      getRecentPRs(),
      getLatestWorkflowRun(),
    ]);
  } catch {
    stats = {
      totalIncidents: 0,
      openIssues: 0,
      fixesAttempted: 0,
      lastScan: null,
      lastScanStatus: null,
    };
    incidents = [];
    prs = [];
    agent = null;
  }

  return (
    <div className="p-6 space-y-6">
      <OverviewRefresher />
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Overview</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Real-time SRE incident intelligence
        </p>
      </div>

      <StatsBar stats={stats} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <IncidentsFeed incidents={incidents} />
        </div>
        <div className="space-y-6">
          <AgentStatus run={agent} action={<RunAgentBtn />} />
          <RecentPRs prs={prs} />
        </div>
      </div>
    </div>
  );
}
