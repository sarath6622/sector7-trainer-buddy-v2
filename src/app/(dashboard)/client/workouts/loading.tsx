function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted/60 ${className ?? ''}`} />;
}

export default function WorkoutsLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      {/* Header */}
      <div className="space-y-1.5">
        <Bone className="h-7 w-36" />
        <Bone className="h-4 w-52" />
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <Bone className="h-10 flex-1 rounded-xl" />
        <Bone className="h-10 w-10 rounded-xl" />
      </div>

      {/* Workout cards */}
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl bg-card p-4 ring-1 ring-border/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1.5">
                <Bone className="h-4 w-32" />
                <Bone className="h-3 w-24" />
              </div>
              <Bone className="h-6 w-16 rounded-full" />
            </div>
            <div className="flex gap-2">
              {[0, 1, 2].map((j) => (
                <Bone key={j} className="h-6 w-20 rounded-full" />
              ))}
            </div>
            <div className="space-y-2 pt-1 border-t border-border/50">
              {[0, 1].map((j) => (
                <div key={j} className="flex items-center gap-3">
                  <Bone className="h-4 w-4 rounded" />
                  <Bone className="h-3.5 w-28" />
                  <Bone className="h-3.5 w-16 ml-auto" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
