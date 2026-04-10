function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted/60 ${className ?? ''}`} />;
}

export default function UnavailabilityLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Bone className="h-7 w-40" />
          <Bone className="h-4 w-56" />
        </div>
        <Bone className="h-9 w-28 rounded-xl" />
      </div>

      {/* Month filter */}
      <Bone className="h-10 w-44 rounded-xl" />

      {/* Record list */}
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <Bone className="h-4 w-36" />
                <div className="flex flex-wrap gap-2 pt-1">
                  {[0, 1, 2].map((j) => (
                    <Bone key={j} className="h-6 w-20 rounded-full" />
                  ))}
                </div>
              </div>
              <Bone className="h-8 w-8 shrink-0 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
