function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted/60 ${className ?? ''}`} />;
}

export default function ProgressLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Bone className="h-7 w-36" />
          <Bone className="h-4 w-52" />
        </div>
        <Bone className="h-9 w-24 rounded-xl" />
      </div>

      {/* Metric tab pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-8 w-20 shrink-0 rounded-full" />
        ))}
      </div>

      {/* Chart card */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50 space-y-4">
        <div className="flex items-center justify-between">
          <Bone className="h-4 w-24" />
          <Bone className="h-4 w-16" />
        </div>
        <Bone className="h-48 w-full rounded-xl" />
      </div>

      {/* Latest stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl bg-card p-4 ring-1 ring-border/50 space-y-3">
            <div className="flex items-center gap-2">
              <Bone className="h-8 w-8 rounded-xl" />
              <Bone className="h-3 w-16" />
            </div>
            <Bone className="h-8 w-20" />
            <Bone className="h-3 w-14" />
          </div>
        ))}
      </div>

      {/* History list */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <Bone className="h-4 w-20" />
          <Bone className="h-4 w-16" />
        </div>
        <div className="divide-y divide-border/50">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Bone className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Bone className="h-3.5 w-24" />
                <Bone className="h-3 w-36" />
              </div>
              <Bone className="h-4 w-4 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
