function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted/60 ${className ?? ''}`} />;
}

export default function BadgesLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bone className="h-6 w-6 rounded-lg" />
        <div className="space-y-1.5">
          <Bone className="h-6 w-28" />
          <Bone className="h-4 w-56" />
        </div>
      </div>

      {/* Badge grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl bg-card p-4 ring-1 ring-border/50 flex flex-col items-center gap-3"
          >
            <Bone className="h-14 w-14 rounded-full" />
            <Bone className="h-4 w-24" />
            <Bone className="h-3 w-32" />
            <Bone className="h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
