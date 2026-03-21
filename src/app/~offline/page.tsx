'use client';

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center space-y-4 px-6">
        <h1 className="text-4xl font-bold">You&apos;re Offline</h1>
        <p className="text-muted-foreground max-w-md">
          It looks like you&apos;ve lost your internet connection. Don&apos;t worry — your workout
          data is saved locally and will sync automatically when you&apos;re back online.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
