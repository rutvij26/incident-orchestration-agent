export default function IncidentsLoading() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="h-6 w-24 bg-zinc-800 rounded animate-pulse" />
        <div className="h-4 w-56 bg-zinc-800 rounded animate-pulse mt-2" />
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-4">
        {/* Filter tabs skeleton */}
        <div className="flex gap-3 border-b border-zinc-800 pb-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-6 w-16 bg-zinc-800 rounded animate-pulse" />
          ))}
        </div>
        {/* Table rows skeleton */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 items-center">
            <div className="h-5 w-16 bg-zinc-800 rounded animate-pulse" />
            <div className="h-5 flex-1 bg-zinc-800 rounded animate-pulse" />
            <div className="h-5 w-8 bg-zinc-800 rounded animate-pulse" />
            <div className="h-5 w-24 bg-zinc-800 rounded animate-pulse" />
            <div className="h-5 w-32 bg-zinc-800 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
