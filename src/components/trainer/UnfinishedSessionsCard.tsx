'use client';

import { AlertTriangle, Square } from 'lucide-react';

export interface UnfinishedSession {
  id: string;
  /** ISO date of the day it was scheduled for. */
  scheduledDate: string;
  /** When the trainer actually started it; falls back to scheduledDate. */
  startedAt?: string;
  clientFirstName: string;
  clientLastName: string;
}

/** Human "Open for N minutes/hours/days" age for a never-ended session, measured
 *  from when it actually started. A live HH:MM:SS clock is meaningless for a
 *  session left running for days (e.g. a 32-day-old "780:31:26"). */
export function openForLabel(s: UnfinishedSession, now: number = Date.now()): string {
  const ref = new Date(s.startedAt ?? s.scheduledDate).getTime();
  const mins = Math.floor((now - ref) / 60_000);
  if (mins < 60) {
    const m = Math.max(1, mins);
    return `Open for ${m} minute${m === 1 ? '' : 's'}`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Open for ${hrs} hour${hrs === 1 ? '' : 's'}`;
  const days = Math.floor(hrs / 24);
  return `Open for ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Sessions left IN_PROGRESS on a *previous* day — a trainer walked off without
 * ending one. The Today list is date-scoped, so these never appear there and
 * this is the only place they surface.
 *
 * Today's live sessions are deliberately NOT shown here. They already carry an
 * "In Progress" pill and a running timer in the Today list; rendering them in
 * both places cost most of a screen to say the same thing twice.
 */
export function UnfinishedSessionsCard({
  sessions,
  onOpen,
}: {
  sessions: UnfinishedSession[];
  onOpen: (id: string) => void;
}) {
  if (sessions.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/50">
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
        <h2 className="text-sm font-bold text-amber-500">
          {sessions.length === 1 ? 'Unfinished session' : `${sessions.length} unfinished sessions`}
        </h2>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">never ended</span>
      </div>

      <div className="space-y-2 px-3 pb-3">
        {sessions.map((s) => {
          const date = new Date(s.scheduledDate);
          return (
            <div key={s.id} className="rounded-xl border border-border/50 bg-muted/20 p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-muted">
                  <span className="text-sm font-bold leading-none">
                    {date.toLocaleDateString('en-IN', { day: 'numeric' })}
                  </span>
                  <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                    {date.toLocaleDateString('en-IN', { month: 'short' })}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {s.clientFirstName} {s.clientLastName}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{openForLabel(s)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(s.id)}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2.5 text-xs font-bold text-amber-950 transition-colors hover:bg-amber-400 active:scale-[0.97] [touch-action:manipulation] [-webkit-tap-highlight-color:transparent]"
                >
                  <Square className="h-3.5 w-3.5" />
                  Resume &amp; end
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
