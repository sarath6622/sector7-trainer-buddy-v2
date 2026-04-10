function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted/60 ${className ?? ''}`} />;
}

export default function SessionDetailLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      {/* Back + title */}
      <div className="flex items-center gap-3">
        <Bone className="h-8 w-8 rounded-lg" />
        <Bone className="h-6 w-32" />
      </div>

      {/* Session hero card */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Bone className="h-5 w-28" />
            <Bone className="h-4 w-36" />
          </div>
          <Bone className="h-7 w-20 rounded-full" />
        </div>
        <div className="grid grid-cols-3 gap-3 pt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl bg-muted/40 p-3 space-y-1.5">
              <Bone className="h-3 w-12" />
              <Bone className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Trainer card */}
      <div className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-border/50">
        <Bone className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Bone className="h-4 w-28" />
          <Bone className="h-3 w-20" />
        </div>
      </div>

      {/* Workout log section */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50 overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border/50">
          <Bone className="h-4 w-28" />
          <Bone className="h-8 w-24 rounded-xl" />
        </div>
        <div className="divide-y divide-border/50">
          {[0, 1, 2].map((i) => (
            <div key={i} className="p-4 space-y-2">
              <div className="flex items-center gap-3">
                <Bone className="h-8 w-8 rounded-lg" />
                <Bone className="h-4 w-32" />
                <Bone className="h-4 w-16 ml-auto rounded-full" />
              </div>
              <div className="flex gap-2 pl-11">
                {[0, 1, 2].map((j) => (
                  <Bone key={j} className="h-6 w-20 rounded-lg" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
