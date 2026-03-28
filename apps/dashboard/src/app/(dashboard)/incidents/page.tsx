export const dynamic = "force-dynamic";

import { getIncidents } from "@/lib/queries/incidents";
import { IncidentsTable } from "@/components/incidents/IncidentsTable";
import type { IncidentStatus } from "@agentic/shared";

const VALID_STATUSES: IncidentStatus[] = ["open", "acknowledged", "resolved"];

interface PageProps {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}

export default async function IncidentsPage({ searchParams }: PageProps) {
  const { status: statusParam, cursor } = await searchParams;

  const status =
    statusParam && VALID_STATUSES.includes(statusParam as IncidentStatus)
      ? (statusParam as IncidentStatus)
      : null;

  const { data, nextCursor } = await getIncidents({
    status,
    limit: 50,
    cursor: cursor ?? null,
  });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Incidents</h1>
        <p className="text-sm text-zinc-500 mt-1">
          All detected incidents, ordered by most recent
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <IncidentsTable
          initialData={data}
          initialNextCursor={nextCursor}
          initialStatus={statusParam ?? ""}
        />
      </div>
    </div>
  );
}
