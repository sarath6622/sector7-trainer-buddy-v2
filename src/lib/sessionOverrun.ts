/**
 * Session-overrun policy — pure time math, no I/O.
 *
 * A session goes IN_PROGRESS when the trainer taps "Start Workout" and only
 * leaves that state when they tap "End Session". Trainers forget, so an
 * instance can sit IN_PROGRESS for days (observed in production: 45 days).
 * These helpers define *when* we nudge the trainer and *when* the session is
 * considered abandoned. The cron scan (`processOverrunReminders`) is the only
 * caller that acts on them; the admin Sessions page uses `overrunMinutes` for
 * display.
 *
 * All measurements are wall-clock from `startedAt` and deliberately ignore
 * pause time: the question these answer is "was this left open?", not "how
 * much training happened" (that is `actualDurationMin`, which does net out
 * pauses — see `endSession`).
 */

/** Reminder 1 fires the moment the session passes its booked duration. */
export const OVERRUN_STAGE_1_OFFSET_MIN = 0;
/** Reminder 2 fires 15 minutes after that. */
export const OVERRUN_STAGE_2_OFFSET_MIN = 15;
/** Past this much wall-clock the session is abandoned, not overrunning. */
export const AUTO_CLOSE_AFTER_MIN = 24 * 60;

/** Highest reminder stage that exists. Stage 0 means "nothing due". */
export type OverrunStage = 0 | 1 | 2;

/**
 * Whole minutes a session has been open, measured from `startedAt`.
 * Returns 0 when the session never started or the timestamp is unusable.
 */
export function elapsedMinutes(
  startedAt: string | Date | null,
  now: Date = new Date(),
): number {
  if (!startedAt) return 0;
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return 0;
  const ms = now.getTime() - started;
  return ms > 0 ? Math.floor(ms / 60_000) : 0;
}

/**
 * How many whole minutes an IN_PROGRESS session has run past its planned
 * duration. Returns 0 when the session hasn't overrun (or hasn't started).
 */
export function overrunMinutes(
  startedAt: string | Date | null,
  durationMin: number,
  now: Date = new Date(),
): number {
  if (!startedAt) return 0;
  const started = new Date(startedAt).getTime();
  if (Number.isNaN(started)) return 0;
  const plannedEnd = started + durationMin * 60_000;
  const overMs = now.getTime() - plannedEnd;
  return overMs > 0 ? Math.floor(overMs / 60_000) : 0;
}

/**
 * The highest reminder stage currently due for a session, or 0 if none is.
 * Stages are cumulative thresholds off the *booked* duration, so a 30-minute
 * slot is nudged sooner than a 90-minute one.
 *
 * A session old enough to auto-close returns 0 — it is past nudging, and the
 * scan handles it on the close path instead.
 */
export function dueOverrunStage(
  startedAt: string | Date | null,
  durationMin: number,
  now: Date = new Date(),
): OverrunStage {
  if (!startedAt) return 0;
  const elapsed = elapsedMinutes(startedAt, now);
  if (elapsed >= AUTO_CLOSE_AFTER_MIN) return 0;
  if (elapsed >= durationMin + OVERRUN_STAGE_2_OFFSET_MIN) return 2;
  if (elapsed >= durationMin + OVERRUN_STAGE_1_OFFSET_MIN) return 1;
  return 0;
}

/** True once a session has been open long enough to be treated as abandoned. */
export function isStaleForAutoClose(
  startedAt: string | Date | null,
  now: Date = new Date(),
): boolean {
  if (!startedAt) return false;
  return elapsedMinutes(startedAt, now) >= AUTO_CLOSE_AFTER_MIN;
}

/** Human "1 h 20 m" / "3 days" age used in notification bodies. */
export function openForLabel(
  startedAt: string | Date | null,
  now: Date = new Date(),
): string {
  const mins = elapsedMinutes(startedAt, now);
  if (mins < 60) return `${Math.max(1, mins)} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    const rem = mins % 60;
    return rem === 0 ? `${hrs} hr` : `${hrs} hr ${rem} min`;
  }
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}
