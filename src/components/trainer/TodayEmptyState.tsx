'use client';

import { Plus } from 'lucide-react';

/**
 * The trainer dashboard's "Today" block when nothing is booked.
 *
 * A blank card is dead space on the gym floor — the trainer still has work they
 * can do. Trainers may self-book for any client they hold an active PT package
 * with, so the one action that matters here is scheduling a session; it
 * deep-links to the existing booking modal already set to today.
 *
 * Presentational only — navigation is handed back through `onNavigate` so the
 * dashboard owns routing and this stays trivially testable.
 */
export function TodayEmptyState({
  clientCount,
  onNavigate,
}: {
  /** Active (non-reassigned) clients the trainer can book for. */
  clientCount: number;
  onNavigate: (href: string) => void;
}) {
  const hasClients = clientCount > 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 px-5 py-8 text-center">
      {/* Calendar with a brand-coloured check — drawn inline so the tick can
          take the primary colour while the frame stays muted. */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mx-auto h-12 w-12"
        aria-hidden
      >
        <g className="stroke-muted-foreground/60">
          <path d="M8 2v4" />
          <path d="M16 2v4" />
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <path d="M3 10h18" />
        </g>
        <path d="m9 16 2 2 4-4" className="stroke-primary" />
      </svg>

      <h3 className="mt-4 text-lg font-bold tracking-tight">No sessions scheduled</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasClients
          ? 'Your schedule is clear today.'
          : 'No clients assigned to you yet. Ask your admin to map some.'}
      </p>

      {hasClients && (
        <button
          type="button"
          onClick={() => onNavigate('/trainer/schedule?book=today')}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] [touch-action:manipulation] [-webkit-tap-highlight-color:transparent]"
        >
          <Plus className="h-4.5 w-4.5" strokeWidth={2.5} />
          Schedule session
        </button>
      )}
    </div>
  );
}
