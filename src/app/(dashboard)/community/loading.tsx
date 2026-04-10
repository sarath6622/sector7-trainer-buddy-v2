function Bone({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted/60 ${className ?? ''}`} />;
}

export default function CommunityLoading() {
  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border/40">
        <div className="space-y-1.5">
          <Bone className="h-6 w-32" />
          <Bone className="h-3.5 w-48" />
        </div>
        <Bone className="h-9 w-28 rounded-xl" />
      </div>

      {/* Post skeletons */}
      {[1, 2].map((i) => (
        <div key={i} className="border-b border-border/40">
          {/* Author row */}
          <div className="flex items-center gap-3 px-4 py-3">
            <Bone className="h-11 w-11 rounded-full" />
            <div className="space-y-1.5">
              <Bone className="h-3.5 w-28" />
              <Bone className="h-3 w-16" />
            </div>
          </div>
          {/* Square banner */}
          <Bone className="w-full aspect-square rounded-none" />
          {/* Actions */}
          <div className="px-4 pt-3 pb-4 space-y-2">
            <div className="flex gap-4">
              <Bone className="h-6 w-6 rounded-full" />
              <Bone className="h-6 w-6 rounded-full" />
            </div>
            <Bone className="h-3.5 w-20" />
            <Bone className="h-3.5 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}
