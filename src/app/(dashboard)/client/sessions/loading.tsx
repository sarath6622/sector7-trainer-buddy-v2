function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted/60 ${className ?? ''}`} />;
}

export default function SessionsLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      {/* Header */}
      <div className="space-y-1.5">
        <Bone className="h-7 w-32" />
        <Bone className="h-4 w-48" />
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between rounded-2xl bg-card p-3 ring-1 ring-border/50">
        <Bone className="h-8 w-8 rounded-lg" />
        <Bone className="h-5 w-28" />
        <Bone className="h-8 w-8 rounded-lg" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl bg-card p-3.5 ring-1 ring-border/50 space-y-2">
            <Bone className="h-8 w-8 rounded-xl" />
            <Bone className="h-6 w-8" />
            <Bone className="h-2.5 w-14" />
          </div>
        ))}
      </div>

      {/* Session list */}
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
            <div className="flex items-center gap-4">
              <Bone className="h-14 w-14 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Bone className="h-4 w-20" />
                  <Bone className="h-5 w-16 rounded-full" />
                </div>
                <Bone className="h-3.5 w-32" />
                <Bone className="h-3 w-24" />
              </div>
              <Bone className="h-4 w-4 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
