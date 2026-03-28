export default function OverviewLoading() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="h-6 w-32 bg-zinc-800 rounded animate-pulse" />
        <div className="h-4 w-56 bg-zinc-800 rounded animate-pulse mt-2" />
      </div>

      {/* StatsBar skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
            <div className="h-3 w-20 bg-zinc-800 rounded animate-pulse" />
            <div className="h-7 w-12 bg-zinc-800 rounded animate-pulse" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Incidents skeleton */}
        <div className="lg:col-span-2 bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="h-4 w-32 bg-zinc-800 rounded animate-pulse" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-5 w-16 bg-zinc-800 rounded animate-pulse" />
              <div className="h-5 flex-1 bg-zinc-800 rounded animate-pulse" />
              <div className="h-5 w-14 bg-zinc-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="space-y-6">
          {/* AgentStatus skeleton */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
            <div className="h-4 w-24 bg-zinc-800 rounded animate-pulse" />
            <div className="h-5 w-20 bg-zinc-800 rounded animate-pulse" />
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 bg-zinc-800 rounded animate-pulse" />
              ))}
            </div>
          </div>
          {/* PRs skeleton */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
            <div className="h-4 w-32 bg-zinc-800 rounded animate-pulse" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 bg-zinc-800 rounded animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
