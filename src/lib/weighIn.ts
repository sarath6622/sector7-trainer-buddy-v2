/**
 * Weigh-in nudge — decides whether a client is overdue for logging their weight
 * and assembles the "how far you've come" payload the prompt uses to motivate.
 *
 * Pure functions only (no Prisma, no Date.now() unless defaulted) so the rules
 * are unit-testable and identical wherever they run.
 *
 * Only `weightKg` counts. A progress entry carrying just a body-fat reading or a
 * tape measurement does NOT reset the clock — the nudge is specifically about
 * weight, which is the one metric a client can self-report accurately at home.
 */

/** A progress entry as far as the nudge cares: a date and maybe a weight. */
export interface WeighInSource {
  weightKg: number | null;
  recordedAt: Date | string;
}

export interface WeighInPoint {
  weightKg: number;
  recordedAt: string;
}

export type WeighInReason = 'NEVER_LOGGED' | 'STALE';

export interface WeighInNudge {
  shouldPrompt: boolean;
  reason: WeighInReason | null;
  thresholdDays: number;
  daysSinceLastWeighIn: number | null;
  lastWeighIn: WeighInPoint | null;
  firstWeighIn: WeighInPoint | null;
  totalChangeKg: number | null;
  entryCount: number;
  trackedDays: number | null;
  series: { date: string; value: number }[];
}

/** Most recent weigh-ins kept for the prompt's sparkline. */
const SERIES_LIMIT = 12;

const MS_PER_DAY = 86_400_000;

/** Whole days between two instants, counted on local calendar days (IST-safe). */
function localDaysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** Round to one decimal — weights are logged to 0.1 kg, so don't imply more. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Build the nudge payload from a client's progress entries.
 *
 * @param entries       Progress entries in any order; only those with a usable
 *                      `weightKg` and a valid `recordedAt` are considered.
 * @param thresholdDays Branch's `measurementReminderDays` — the same window that
 *                      drives the trainer/admin "No measurements" badge.
 * @param now           Injectable clock for tests.
 */
export function buildWeighInNudge(
  entries: WeighInSource[],
  thresholdDays: number,
  now: Date = new Date(),
): WeighInNudge {
  const weighIns = entries
    .flatMap((e) => {
      if (e.weightKg == null || !Number.isFinite(e.weightKg)) return [];
      const recordedAt = e.recordedAt instanceof Date ? e.recordedAt : new Date(e.recordedAt);
      if (Number.isNaN(recordedAt.getTime())) return [];
      return [{ weightKg: e.weightKg, recordedAt }];
    })
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  // A threshold of 0 or less would nudge every single login — treat it as the
  // documented default rather than harassing the client.
  const window = thresholdDays > 0 ? thresholdDays : 30;

  const first = weighIns[0];
  const last = weighIns[weighIns.length - 1];

  if (!first || !last) {
    return {
      shouldPrompt: true,
      reason: 'NEVER_LOGGED',
      thresholdDays: window,
      daysSinceLastWeighIn: null,
      lastWeighIn: null,
      firstWeighIn: null,
      totalChangeKg: null,
      entryCount: 0,
      trackedDays: null,
      series: [],
    };
  }

  // Clamp at 0: a weigh-in dated in the future shouldn't read as "-3 days ago".
  const daysSinceLastWeighIn = Math.max(0, localDaysBetween(last.recordedAt, now));
  const stale = daysSinceLastWeighIn >= window;

  const toPoint = (w: { weightKg: number; recordedAt: Date }): WeighInPoint => ({
    weightKg: w.weightKg,
    recordedAt: w.recordedAt.toISOString(),
  });

  return {
    shouldPrompt: stale,
    reason: stale ? 'STALE' : null,
    thresholdDays: window,
    daysSinceLastWeighIn,
    lastWeighIn: toPoint(last),
    firstWeighIn: toPoint(first),
    totalChangeKg: weighIns.length >= 2 ? round1(last.weightKg - first.weightKg) : null,
    entryCount: weighIns.length,
    trackedDays:
      weighIns.length >= 2 ? Math.max(0, localDaysBetween(first.recordedAt, last.recordedAt)) : null,
    series: weighIns.slice(-SERIES_LIMIT).map((w) => ({
      date: w.recordedAt.toISOString(),
      value: w.weightKg,
    })),
  };
}
