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
