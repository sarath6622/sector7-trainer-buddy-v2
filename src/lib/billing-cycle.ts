/**
 * Billing-cycle math for PT packages — pure functions, no I/O, no Prisma.
 *
 * Implements S7-BC-03 from `tasks/phase-24-billing-cycles.md`, which was
 * specified in May 2026 and never built. Without it every surface improvised
 * its own idea of "this cycle": the trainer calendar used the calendar month,
 * `getPackageWindowCounts` used the whole package window, and open-ended
 * packages silently fell back to `startDate + 30 days` — frozen forever.
 *
 * ─── CYCLE BOUNDARY RULE ──────────────────────────────────────────────────
 * A package's `startDate` IS the anchor; its day-of-month fixes every later
 * boundary. Cycle N starts on the anchor day of the Nth month after the start
 * and ends at 23:59:59.999 the day before cycle N+1 begins.
 *
 * When a month is too short for the anchor, the start clamps to that month's
 * last day: `cycleStart = min(anchorDay, daysInMonth)`. The anchor NEVER
 * drifts — it is restored as soon as a month is long enough to hold it.
 * Anchor 31: Jan 31 → Feb 28 → Mar 31 → Apr 30 → May 31.
 *
 * Every boundary is therefore computed from the ORIGINAL anchor, never
 * iteratively from the previous cycle (which would let a clamp propagate).
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Multi-month plans hold several cycles: `durationDays` sizes the package
 * (90 days → 3 cycles), while `sessionsPerMonth` is the per-cycle allowance
 * and `totalSessions` the package-wide quota.
 *
 * All dates are local-time, matching how the admin mapping form and the
 * scheduling pages build theirs.
 */

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Shape of a package, reduced to the fields the cycle math needs. */
export interface CycleConfig {
  /** Package start — the anchor. Its day-of-month fixes every later boundary. */
  startDate: Date;
  /** Plan duration in days (30 / 90 / 180 / 365). Sizes the package in cycles. */
  durationDays: number;
  /**
   * Admin hard stop. Normally null: a package runs until its sessions are
   * consumed, which is why `PtPackage.endDate` is nullable. Only set when an
   * admin has explicitly forced an end date.
   */
  hardEndDate?: Date | null;
}

export interface BillingCycle {
  /** 1-based position within the package. */
  index: number;
  /** 00:00:00.000 local on the cycle's first day. */
  start: Date;
  /** 23:59:59.999 local on the cycle's last day (inclusive). */
  end: Date;
  /** Human label, e.g. "15 Aug – 14 Sep" or "15 Dec 2026 – 14 Jan 2027". */
  label: string;
}

/**
 * Derived package lifecycle. Replaces the overloaded nullable `endDate`, which
 * was being used to mean both "no hard stop" and "still has sessions pending".
 */
export type PackageState =
  /** Inside the nominal window, sessions remain. */
  | 'ACTIVE'
  /** Past the nominal window but sessions remain — keep counting, flag overdue. */
  | 'GRACE'
  /** Quota consumed, whether or not time remains. */
  | 'EXHAUSTED'
  /** An admin-set hard end date has passed. */
  | 'CLOSED';

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** How many monthly cycles a package of `durationDays` holds. */
export function cycleCount(durationDays: number): number {
  return Math.max(1, Math.round(durationDays / 30));
}

/**
 * Start of the cycle `monthsAfter` months past the anchor, applying the clamp
 * rule. Always derived from the original anchor so a clamp never propagates.
 */
function anchoredStart(startDate: Date, monthsAfter: number): Date {
  const anchor = startDate.getDate();
  const absoluteMonth = startDate.getMonth() + monthsAfter;
  const year = startDate.getFullYear() + Math.floor(absoluteMonth / 12);
  const month = ((absoluteMonth % 12) + 12) % 12;
  return new Date(year, month, Math.min(anchor, daysInMonth(year, month)), 0, 0, 0, 0);
}

function formatCycleLabel(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear();
  const fmt = (d: Date) =>
    `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
  return `${fmt(start)} – ${fmt(end)}`;
}

function buildCycle(cfg: CycleConfig, zeroBasedIndex: number): BillingCycle {
  const start = anchoredStart(cfg.startDate, zeroBasedIndex);
  const end = new Date(anchoredStart(cfg.startDate, zeroBasedIndex + 1).getTime() - 1);
  return { index: zeroBasedIndex + 1, start, end, label: formatCycleLabel(start, end) };
}

/** Every cycle the package nominally contains, in order. */
export function getPackageCycles(cfg: CycleConfig): BillingCycle[] {
  const count = cycleCount(cfg.durationDays);
  return Array.from({ length: count }, (_, i) => buildCycle(cfg, i));
}

/**
 * End of the package's nominal window — the last cycle's end. Always
 * computable, which is the point: it replaces `endDate ?? startDate + 30d`.
 */
export function getNominalEnd(cfg: CycleConfig): Date {
  return new Date(anchoredStart(cfg.startDate, cycleCount(cfg.durationDays)).getTime() - 1);
}

/**
 * The cycle containing `refDate`. Dates before the package starts return
 * cycle 1; dates past the nominal end return the LAST cycle, because a package
 * in GRACE has no cycle N+1 — it has leftover sessions from its final one.
 */
export function getCycleForDate(cfg: CycleConfig, refDate: Date): BillingCycle {
  const count = cycleCount(cfg.durationDays);
  const start = cfg.startDate;

  let k =
    (refDate.getFullYear() - start.getFullYear()) * 12 + (refDate.getMonth() - start.getMonth());
  if (k < 0) k = 0;
  if (k > count - 1) k = count - 1;

  // Month arithmetic can be off by one around a clamped anchor; settle it by
  // comparing against the real boundaries.
  while (k > 0 && refDate < anchoredStart(start, k)) k--;
  while (k + 1 < count && refDate >= anchoredStart(start, k + 1)) k++;

  return buildCycle(cfg, k);
}

/** Cycle immediately before `cycle`, or null if it is the first. */
export function previousCycle(cfg: CycleConfig, cycle: BillingCycle): BillingCycle | null {
  return cycle.index <= 1 ? null : buildCycle(cfg, cycle.index - 2);
}

/** Cycle immediately after `cycle`, or null if it is the package's last. */
export function nextCycle(cfg: CycleConfig, cycle: BillingCycle): BillingCycle | null {
  return cycle.index >= cycleCount(cfg.durationDays) ? null : buildCycle(cfg, cycle.index);
}

/**
 * Derived lifecycle state. Precedence: an admin hard stop wins, then an
 * exhausted quota, then time.
 */
export function getPackageState(
  cfg: CycleConfig,
  refDate: Date,
  counts: { used: number; totalSessions: number },
): PackageState {
  if (cfg.hardEndDate && refDate > cfg.hardEndDate) return 'CLOSED';
  if (counts.totalSessions > 0 && counts.used >= counts.totalSessions) return 'EXHAUSTED';
  if (refDate > getNominalEnd(cfg)) return 'GRACE';
  return 'ACTIVE';
}

/**
 * How far to count sessions when tallying a package.
 *
 * This is the line that fixes the prod-wide undercount: a package whose time
 * has elapsed with sessions still pending keeps counting up to `refDate`
 * instead of freezing at its nominal end (previously `startDate + 30 days`,
 * which never moved again).
 */
export function getCountingWindowEnd(
  cfg: CycleConfig,
  refDate: Date,
  counts: { used: number; totalSessions: number },
): Date {
  const state = getPackageState(cfg, refDate, counts);
  if (state === 'CLOSED') return cfg.hardEndDate!;
  if (state === 'GRACE') return refDate;
  const nominalEnd = getNominalEnd(cfg);
  return cfg.hardEndDate && cfg.hardEndDate < nominalEnd ? cfg.hardEndDate : nominalEnd;
}

export interface CycleAllowance {
  cycle: BillingCycle;
  /** Sessions consumed inside this cycle (COMPLETED + NO_SHOW). */
  used: number;
  /** Unused sessions rolled in from the previous cycle, already capped. */
  carriedIn: number;
  /** `sessionsPerCycle + carriedIn` — what the client may use this cycle. */
  allowance: number;
  /** Unused sessions rolled out to the next cycle, capped. */
  carriedOut: number;
}

/**
 * Walk a package's cycles in order, rolling unused sessions forward.
 *
 * The anchor stays fixed: cycle N+1 begins on its own date whether or not
 * cycle N was fully used, and the leftovers travel with the client as credit
 * (capped by `carryForwardLimit`). This is the "cycle 2 starts on time, the 3
 * pending carry over" rule — the reason `PtPackage.carryForwardLimit` exists.
 */
export function rollCycleAllowances({
  cycles,
  usedPerCycle,
  sessionsPerCycle,
  carryForwardLimit,
}: {
  cycles: BillingCycle[];
  /** Sessions consumed per cycle, parallel to `cycles`. */
  usedPerCycle: number[];
  sessionsPerCycle: number;
  /** Max sessions that may roll into the next cycle. */
  carryForwardLimit: number;
}): CycleAllowance[] {
  const out: CycleAllowance[] = [];
  let carriedIn = 0;

  for (let i = 0; i < cycles.length; i++) {
    const cycle = cycles[i]!;
    const used = usedPerCycle[i] ?? 0;
    const allowance = sessionsPerCycle + carriedIn;
    const carriedOut = Math.min(Math.max(0, allowance - used), Math.max(0, carryForwardLimit));
    out.push({ cycle, used, carriedIn, allowance, carriedOut });
    carriedIn = carriedOut;
  }

  return out;
}
