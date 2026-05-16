'use client';

import { Pause, Play, Square } from 'lucide-react';

// ─── Utils ────────────────────────────────────────────────────────────────────

export function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

/**
 * Compute the most-recent activity timestamp (ms) for a session — the latest
 * of `startedAt`, any `workoutLog.updatedAt`, or any `set.createdAt`. Used by
 * `SessionHero` for the "Xm idle" pill and by the trainer's `OthersChip`
 * strip for cross-client idle escalation. Returns null if the session hasn't
 * started yet, so the caller can suppress the idle pill entirely.
 *
 * Shape is the loose intersection both pages produce — `unknown` workoutLogs
 * shape, defensive optional reads. Keeps the helper agnostic to which page
 * is calling.
 */
export function lastActivityMsOf(session: {
  startedAt?: string | null;
  workoutLogs?: Array<{
    updatedAt?: string;
    sets?: Array<{ createdAt?: string }>;
  }>;
}): number | null {
  if (!session?.startedAt) return null;
  let latest = new Date(session.startedAt).getTime();
  for (const log of session.workoutLogs ?? []) {
    if (log.updatedAt) {
      const t = new Date(log.updatedAt).getTime();
      if (t > latest) latest = t;
    }
    for (const set of log.sets ?? []) {
      if (set.createdAt) {
        const t = new Date(set.createdAt).getTime();
        if (t > latest) latest = t;
      }
    }
  }
  return latest;
}

function formatIdle(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${hr}h` : `${hr}h${rem}m`;
}

function formatElapsedFromSec(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatRestRemaining(sec: number | null): string {
  if (sec === null || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ─── Status pill type ────────────────────────────────────────────────────────

type HeroStatus =
  | { kind: 'session-paused'; label: string }
  | { kind: 'rest-running'; label: string }
  | { kind: 'rest-paused'; label: string }
  | { kind: 'rest-done-fresh'; label: string }
  | { kind: 'rest-done-warn'; label: string }
  | { kind: 'rest-done-urgent'; label: string }
  | { kind: 'idle-warn'; label: string }
  | { kind: 'idle-urgent'; label: string }
  | { kind: 'live'; label: string };

const pillStyles: Record<HeroStatus['kind'], { text: string; dot: string }> = {
  'session-paused': { text: 'text-amber-100', dot: 'bg-amber-300' },
  'rest-running': { text: 'text-blue-100', dot: 'bg-blue-300' },
  'rest-paused': { text: 'text-amber-100', dot: 'bg-amber-300' },
  'rest-done-fresh': { text: 'text-emerald-100', dot: 'bg-emerald-300' },
  'rest-done-warn': { text: 'text-amber-100', dot: 'bg-amber-300' },
  'rest-done-urgent': { text: 'text-rose-100', dot: 'bg-rose-300' },
  'idle-warn': { text: 'text-amber-100', dot: 'bg-amber-300' },
  'idle-urgent': { text: 'text-rose-100', dot: 'bg-rose-300' },
  live: { text: 'text-emerald-100', dot: 'bg-emerald-300' },
};

interface RestTimerSnapshot {
  isDone: boolean;
  isRunning: boolean;
  isPaused: boolean;
  endTime: number | null;
  remaining: number | null;
}

interface SessionHeroProps {
  /** Display name in the hero (trainer-side: client name; client-side: trainer name). */
  name: string;
  /** Two-letter initials shown inside the avatar circle. */
  initials: string;
  /** When the session started (ISO string, ms number, or Date). Null → no elapsed timer. */
  startedAt: string | number | Date | null | undefined;
  /** Expected session length in minutes — drives the avatar progress ring. */
  expectedDurationMin: number;
  /** Server-tracked pause state (from useSessionPause). Both fields default-safe. */
  pausedAt: number | null;
  accumulatedPausedSec: number;
  isPaused: boolean;
  onTogglePause: () => void;
  /** Live rest-timer snapshot — drives the status pill (resting / rest-done / paused). */
  restTimer: RestTimerSnapshot;
  /**
   * Latest activity timestamp (ms) for the underlying session — most recent
   * set createdAt or workoutLog updatedAt. Drives the idle-warn / idle-urgent
   * escalation. Null → suppress idle counter (no logs yet).
   */
  lastActivityMs: number | null;
  /** 1Hz wall clock from the parent so the hero re-renders in lockstep. */
  now: number;
  /**
   * When set, renders the End button next to Pause. Trainer-only by design —
   * lifecycle transitions remain trainer-owned (ADR-036). Clients pass `undefined`.
   */
  onEnd?: () => void;
  ending?: boolean;
}

/**
 * Shared sticky-header hero card used by both the trainer and client session
 * pages. Renders:
 *   • avatar with story-ring progress (elapsed / expected)
 *   • person's name + "SESSION" label
 *   • elapsed timer (paused → amber, overtime → rose)
 *   • status pill (rest-running / rest-done escalation / idle / live / paused)
 *   • Pause toggle (both roles)
 *   • End button (trainer only, gated by `onEnd` prop)
 *
 * Stateless — the parent owns `now`, `lastActivityMs`, and the timer hooks.
 */
export function SessionHero({
  name,
  initials,
  startedAt,
  expectedDurationMin,
  pausedAt,
  accumulatedPausedSec,
  isPaused,
  onTogglePause,
  restTimer,
  lastActivityMs,
  now,
  onEnd,
  ending,
}: SessionHeroProps) {
  // Single floor() over the combined math so the displayed elapsed counter
  // doesn't flicker when paused (the page's 1Hz tick and the pause hook's
  // 1Hz tick aren't in phase, so two independent floor()s jitter ±1s).
  const startedAtMs = startedAt
    ? typeof startedAt === 'number'
      ? startedAt
      : new Date(startedAt).getTime()
    : null;
  const accumulatedPausedMs = accumulatedPausedSec * 1000;
  const livePausedMs = pausedAt ? Math.max(0, now - pausedAt) : 0;
  const elapsedSec = startedAtMs
    ? Math.max(0, Math.floor((now - startedAtMs - accumulatedPausedMs - livePausedMs) / 1000))
    : 0;
  const expectedSec = Math.max(1, expectedDurationMin * 60);
  const progress = Math.min(1, elapsedSec / expectedSec);
  const overtime = elapsedSec >= expectedSec;
  const ringStroke = isPaused
    ? '#fbbf24' // amber while paused
    : overtime
      ? '#fb7185'
      : '#c4b5fd';

  // Idle escalation — same thresholds the OthersChip uses so the active client
  // and inactive peers speak the same vocabulary.
  const idleMs = lastActivityMs != null ? Math.max(0, now - lastActivityMs) : null;
  const idleSec = idleMs != null ? Math.floor(idleMs / 1000) : null;
  const warn = idleSec != null && idleSec >= 480 && idleSec < 1200;
  const urgent = idleSec != null && idleSec >= 1200;
  const showIdle = idleMs != null && idleSec != null && idleSec >= 60;

  // Rest-done escalation: fresh < 2 min, warn 2–5 min, urgent ≥ 5 min.
  const restDoneSec =
    restTimer.isDone && restTimer.endTime != null
      ? Math.max(0, Math.floor((now - restTimer.endTime) / 1000))
      : 0;
  const restDoneFresh = restTimer.isDone && restDoneSec < 120;
  const restDoneWarn = restTimer.isDone && restDoneSec >= 120 && restDoneSec < 300;
  const restDoneUrgent = restTimer.isDone && restDoneSec >= 300;

  // Priority: session-paused → rest-done escalation → rest running/paused →
  // idle escalation → live.
  const status: HeroStatus = isPaused
    ? { kind: 'session-paused', label: 'Session paused' }
    : restDoneUrgent
      ? {
          kind: 'rest-done-urgent',
          label: `Rest done · ${formatIdle(restDoneSec * 1000)}`,
        }
      : restDoneWarn
        ? {
            kind: 'rest-done-warn',
            label: `Rest done · ${formatIdle(restDoneSec * 1000)}`,
          }
        : restDoneFresh
          ? { kind: 'rest-done-fresh', label: 'Rest done!' }
          : restTimer.isRunning
            ? {
                kind: 'rest-running',
                label: `Resting · ${formatRestRemaining(restTimer.remaining)}`,
              }
            : restTimer.isPaused
              ? {
                  kind: 'rest-paused',
                  label: `Rest paused · ${formatRestRemaining(restTimer.remaining)}`,
                }
              : urgent && idleMs != null
                ? { kind: 'idle-urgent', label: `${formatIdle(idleMs)} idle` }
                : warn && idleMs != null
                  ? { kind: 'idle-warn', label: `${formatIdle(idleMs)} idle` }
                  : showIdle && idleMs != null
                    ? { kind: 'live', label: `${formatIdle(idleMs)} idle` }
                    : { kind: 'live', label: 'Live' };

  const pill = pillStyles[status.kind];
  const shouldPing =
    status.kind === 'live' ||
    status.kind === 'rest-done-fresh' ||
    status.kind === 'rest-done-warn' ||
    status.kind === 'rest-done-urgent' ||
    status.kind === 'idle-urgent' ||
    status.kind === 'session-paused';

  const avatarRingR = 22;
  const avatarRingCircumference = 2 * Math.PI * avatarRingR;

  return (
    <div
      role="region"
      aria-label={`${name}, ${status.label}`}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-700 px-3.5 py-2.5 text-white shadow-lg shadow-purple-900/20"
    >
      <div className="flex items-center gap-3">
        {/* Avatar with story-ring progress */}
        <div className="relative h-12 w-12 shrink-0">
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48">
            <circle
              cx="24"
              cy="24"
              r={avatarRingR}
              fill="none"
              stroke="rgba(255,255,255,0.18)"
              strokeWidth="2.5"
            />
            <circle
              cx="24"
              cy="24"
              r={avatarRingR}
              fill="none"
              stroke={ringStroke}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={avatarRingCircumference}
              strokeDashoffset={avatarRingCircumference * (1 - progress)}
              className="transition-[stroke-dashoffset] duration-500"
            />
          </svg>
          <div className="absolute inset-[3px] flex items-center justify-center rounded-full bg-white/15 text-xs font-bold ring-1 ring-white/10">
            {initials}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-sm font-semibold leading-tight">{name}</p>
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-purple-100/70">
              Session
            </span>
          </div>
          <div className="mt-0.5 flex flex-col items-start">
            {startedAtMs && (
              <span
                className={`font-mono text-xl font-black tabular-nums leading-none ${
                  isPaused ? 'text-amber-100/80' : overtime ? 'text-rose-100' : 'text-white'
                }`}
              >
                {formatElapsedFromSec(elapsedSec)}
              </span>
            )}
            <span className="mt-1 flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5 items-center justify-center">
                {shouldPing && (
                  <span
                    className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${pill.dot}`}
                  />
                )}
                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${pill.dot}`} />
              </span>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider tabular-nums ${pill.text}`}
              >
                {status.label}
              </span>
            </span>
          </div>
        </div>
        {/* Right action cluster. Pause first, then End (destructive trailing
            edge). End is trainer-only — clients pass `undefined` for onEnd
            and the button is omitted. */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onTogglePause}
            aria-label={isPaused ? 'Resume session' : 'Pause session'}
            className={`flex h-10 w-10 items-center justify-center rounded-full ring-1 transition-colors active:scale-95 ${
              isPaused
                ? 'bg-amber-400/25 text-amber-100 ring-amber-300/50 hover:bg-amber-400/35'
                : 'bg-white/15 text-white ring-white/20 hover:bg-white/25'
            }`}
          >
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          {onEnd && (
            <button
              type="button"
              onClick={onEnd}
              disabled={ending}
              aria-label="End session"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/25 text-rose-100 ring-1 ring-rose-300/50 transition-colors hover:bg-rose-500/35 active:scale-95 disabled:opacity-50"
            >
              <Square className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
