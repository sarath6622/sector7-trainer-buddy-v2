function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted/60 ${className ?? ''}`} />;
}

export default function ClientDashboardLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      {/* Greeting */}
      <div className="space-y-2">
        <Bone className="h-7 w-40" />
        <Bone className="h-4 w-52" />
      </div>

      {/* Engagement strip */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl bg-card p-3.5 ring-1 ring-border/50 space-y-2">
            <Bone className="h-8 w-8 rounded-xl" />
            <Bone className="h-2.5 w-12" />
            <Bone className="h-6 w-10" />
            <Bone className="h-2 w-14" />
          </div>
        ))}
      </div>

      {/* Fitness journey header */}
      <div className="flex items-center justify-between">
        <Bone className="h-3.5 w-32" />
        <Bone className="h-3.5 w-20" />
      </div>

      {/* Body metric cards */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl bg-card p-4 ring-1 ring-border/50 space-y-3">
            <div className="flex items-center gap-2">
              <Bone className="h-8 w-8 rounded-xl" />
              <Bone className="h-3 w-14" />
            </div>
            <Bone className="h-8 w-24" />
            <Bone className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* PR card */}
      <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50 space-y-3">
        <div className="flex items-center gap-2">
          <Bone className="h-7 w-7 rounded-lg" />
          <Bone className="h-4 w-32" />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Bone className="h-5 w-5 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Bone className="h-3.5 w-28" />
              <Bone className="h-2.5 w-16" />
            </div>
            <Bone className="h-7 w-16 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Sessions ring card */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
        <div className="flex items-center justify-between mb-4">
          <Bone className="h-3.5 w-20" />
          <Bone className="h-3.5 w-20" />
        </div>
        <div className="flex items-center gap-6">
          <Bone className="h-28 w-28 shrink-0 rounded-full" />
          <div className="grid flex-1 grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-2.5">
                <Bone className="h-7 w-7 shrink-0 rounded-lg" />
                <div className="space-y-1.5">
                  <Bone className="h-5 w-6" />
                  <Bone className="h-2.5 w-12" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Next session card */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50 overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <Bone className="h-4 w-4 rounded" />
          <Bone className="h-3.5 w-28" />
        </div>
        <div className="flex items-center gap-4 px-5 pb-5">
          <Bone className="h-14 w-14 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Bone className="h-4 w-24" />
            <Bone className="h-3.5 w-16" />
          </div>
          <Bone className="h-4 w-4 rounded" />
        </div>
        <div className="mx-5 border-t border-border/50" />
        <div className="flex items-center gap-3 px-5 py-4">
          <Bone className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Bone className="h-3.5 w-28" />
            <Bone className="h-3 w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}
