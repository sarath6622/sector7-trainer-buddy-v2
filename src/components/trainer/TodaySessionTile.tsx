'use client';

import type { ReactNode } from 'react';
import { Eye, Play } from 'lucide-react';

export interface TodaySessionTileData {
  id: string;
  /** "HH:MM" in 24h. */
  scheduledTime: string;
  durationMin: number;
  status: string;
  clientFirstName: string;
  clientLastName: string;
}

/** Terminal states have no live clock, so they say their status in words on the
 *  meta line instead. SCHEDULED and IN_PROGRESS are covered by `meta` — a
 *  countdown says "scheduled" and "running" better than the word does. */
const STATUS_NOTE: Record<string, { label: string; className: string }> = {
  COMPLETED: { label: 'Completed', className: 'text-emerald-400' },
  NO_SHOW: { label: 'No show', className: 'text-red-400' },
  CANCELLED: { label: 'Cancelled', className: 'text-muted-foreground' },
};

/** Every row's action is the same size so the column lines up down the list.
 *  Width is set by the longest label ("Starting…" / "Resume" plus its icon) —
 *  the buttons differed by ~30px when each sized to its own text.
 *
 *  `py-3` is deliberate: it holds the hit area at the 40px floor the coding
 *  standards set for touch targets, which `text-xs` alone would drop to 36px. */
const ACTION_BASE =
  'flex w-20 shrink-0 items-center justify-center gap-1.5 rounded-xl py-3 text-xs font-semibold transition-all active:scale-[0.97] [touch-action:manipulation] [-webkit-tap-highlight-color:transparent]';

function formatTime12(t: string): [string, string] {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  return [`${String(hour % 12 || 12).padStart(2, '0')}:${m}`, hour >= 12 ? 'PM' : 'AM'];
}

/**
 * One row of the trainer dashboard's "Today" list: time on the left, client
 * over a single meta line in the middle, the one action that matters on the
 * right.
 *
 * Status is carried by that meta line and by the action button rather than a
 * separate pill — a green "Resume" next to "04:57 left" already says the
 * session is running, and the pill cost a third line on every row.
 */
export function TodaySessionTile({
  session,
  isLoading,
  meta,
  onStart,
  onNoShow,
  onOpen,
}: {
  session: TodaySessionTileData;
  isLoading: boolean;
  /** Live time note for the meta line — the countdown or the running clock. */
  meta?: ReactNode;
  onStart: (id: string) => void;
  onNoShow: (id: string) => void;
  /** Resume a live session, or view a finished one's workout. */
  onOpen: (session: TodaySessionTileData) => void;
}) {
  const [clock, ampm] = formatTime12(session.scheduledTime);
  const isScheduled = session.status === 'SCHEDULED';
  const isLive = session.status === 'IN_PROGRESS';
  const isCompleted = session.status === 'COMPLETED';
  const isCancelled = session.status === 'CANCELLED';

  const note = STATUS_NOTE[session.status];
  const metaNode = meta ?? (note ? <span className={note.className}>{note.label}</span> : null);

  return (
    <div
      className={`rounded-2xl border border-border/50 bg-card p-4 ${
        isCancelled ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-center gap-2.5">
        {/* Time */}
        <div className="w-12 shrink-0">
          <p className="text-base font-bold leading-none tabular-nums">{clock}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{ampm}</p>
        </div>

        {/* Divider — the time no longer outsizes the name, so it needs a rule
            to stay a distinct column. */}
        <div className="h-9 w-px shrink-0 bg-border" aria-hidden />

        {/* Client + meta */}
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[15px] font-semibold leading-tight ${
              isCancelled ? 'line-through' : ''
            }`}
          >
            {session.clientFirstName} {session.clientLastName}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {session.durationMin} min
            {metaNode ? <> · {metaNode}</> : null}
          </p>
        </div>

        {/* Action */}
        {isScheduled && (
          <div className="flex shrink-0 flex-col items-stretch gap-1">
            <button
              type="button"
              onClick={() => onStart(session.id)}
              disabled={isLoading}
              className={`${ACTION_BASE} bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50`}
            >
              {isLoading ? (
                // No icon while loading — "Starting…" alone fills the width.
                'Starting…'
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  Start
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => onNoShow(session.id)}
              disabled={isLoading}
              className="rounded-lg py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-red-400 disabled:opacity-50"
            >
              No show
            </button>
          </div>
        )}

        {isLive && (
          <button
            type="button"
            onClick={() => onOpen(session)}
            className={`${ACTION_BASE} bg-emerald-500 text-white hover:bg-emerald-400`}
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Resume
          </button>
        )}

        {isCompleted && (
          <button
            type="button"
            onClick={() => onOpen(session)}
            aria-label={`View workout for ${session.clientFirstName} ${session.clientLastName}`}
            className={`${ACTION_BASE} border border-border/60 font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground`}
          >
            <Eye className="h-3.5 w-3.5" />
            View
          </button>
        )}
      </div>
    </div>
  );
}
