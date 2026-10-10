import { prisma } from '@/lib/prisma';
import {
  getCountingWindowEnd,
  getCycleForDate,
  getNominalEnd,
  getPackageState,
  type CycleConfig,
  type PackageState,
} from '@/lib/billing-cycle';

/**
 * Read-only reconciliation of what each client has PAID FOR against what they
 * have ACTUALLY USED. Built so an admin can audit the whole branch in one table
 * instead of opening every client card.
 *
 * Two figures are reported per client, and they are deliberately different:
 *
 *  - `current*` — the package they are paying for right now, counted with the
 *    same `billing-cycle` math as `getPackageWindowCounts`, so this page and the
 *    trainer scheduling card never disagree.
 *  - `lifetime*` — everything this client has ever held or consumed. A renewal
 *    creates a NEW PtPackage and the per-package counter restarts at zero, so
 *    `currentUsed` is usually far below what a client believes they have done.
 *    The lifetime column is the number they mean.
 *
 * `onboardingUsedSessions` is reported separately because it counts toward
 * `used` while having NO backing SessionInstance rows (ADR-030) — an auditor
 * comparing this table against the session history needs to see it on its own.
 */

/** Statuses that consume an allowance. */
const CONSUMES = new Set(['COMPLETED', 'NO_SHOW']);
/** Statuses that reserve an allowance without having consumed it yet. */
const OCCUPIES = new Set(['SCHEDULED', 'IN_PROGRESS']);

export type AuditState = PackageState | 'NO_PACKAGE';

/**
 * One package in a client's history — current or long expired.
 *
 * `windowStart`/`windowEnd` are the EFFECTIVE counting window, which is not
 * always the stored start/end: consecutive packages are clipped so they never
 * overlap, otherwise a session falling in the seam would be counted twice and
 * the per-package figures would not sum to the client's lifetime total.
 */
export interface PackageHistoryEntry {
  id: string;
  isActive: boolean;
  planName: string | null;
  trainerName: string | null;
  sessionsPerMonth: number;
  totalSessions: number;
  onboardingUsed: number;
  startDate: string;
  /** The stored admin hard stop. Normally null (ADR-051). */
  endDate: string | null;
  windowStart: string;
  windowEnd: string;
  state: PackageState;
  used: number;
  upcoming: number;
  remaining: number;
  /** Real COMPLETED/NO_SHOW rows attributed to this package, excluding the onboarding offset. */
  sessionRows: number;
  /** True when the stored endDate precedes the startDate — a corrupt row. */
  windowInvalid: boolean;
}

export interface PackageAuditRow {
  clientProfileId: string;
  clientName: string;
  email: string;
  isActive: boolean;
  trainerName: string | null;

  hasActivePackage: boolean;
  planName: string | null;
  sessionsPerMonth: number;
  durationDays: number;
  packageStart: string | null;
  hardEndDate: string | null;
  state: PackageState | null;
  cycleLabel: string | null;
  currentPaid: number;
  currentUsed: number;
  currentUpcoming: number;
  currentRemaining: number;
  onboardingUsed: number;

  packageCount: number;
  lifetimePaid: number;
  lifetimeUsed: number;
  lifetimeSessionRows: number;
  lifetimeOnboarding: number;
  lastSessionDate: string | null;

  /** Every package this client has ever held, newest first. Drives the drawer. */
  packages: PackageHistoryEntry[];
  /**
   * Consumed sessions that fall inside NO package window — before the first
   * package started, or in a gap between one ending and the next beginning.
   * `lifetimeUsed = Σ packages[].used + unattributedUsed`, so the drawer can
   * show arithmetic that actually balances instead of a silent discrepancy.
   */
  unattributedUsed: number;
  /**
   * True when the ACTIVE package is not the latest-starting one, i.e. packages
   * overlap or a later row was closed out of order. The table's current-package
   * figures (which mirror the trainer card) and the drawer's per-package
   * attribution cannot agree in that case — the data itself is contradictory
   * and the row needs an admin to untangle it.
   */
  packagesOverlap: boolean;
  /**
   * True when the current package's attributed total (every session delivered
   * while it was in force) differs from `currentUsed` (what the billing rules
   * charge against the allowance). They diverge legitimately when a package is
   * EXHAUSTED — counting stops at its nominal end while sessions keep being
   * delivered — and illegitimately when packages overlap. Either way the drawer
   * must say so rather than show two numbers that silently disagree.
   */
  currentCountDiffers: boolean;
}

export interface PackageAuditSummary {
  clients: number;
  withActivePackage: number;
  byState: Record<string, number>;
  lifetimePaid: number;
  lifetimeUsed: number;
  overConsumed: number;
}

interface SessionRow {
  clientProfileId: string;
  status: string;
  scheduledDate: Date;
}

/**
 * Resolve the current package's counts exactly as `getPackageWindowCounts`
 * does: a first pass over the nominal window purely to resolve the state, because the
 * GRACE test needs a `used` figure before the real window is known.
 */
function currentPackageCounts(
  cfg: CycleConfig,
  totalSessions: number,
  onboardingUsed: number,
  sessions: SessionRow[],
  now: Date,
) {
  const nominalEnd = getNominalEnd(cfg);
  const nominalUsed =
    sessions.filter((s) => CONSUMES.has(s.status) && s.scheduledDate <= nominalEnd).length +
    onboardingUsed;

  const counts = { used: nominalUsed, totalSessions };
  const state = getPackageState(cfg, now, counts);
  const windowEnd = getCountingWindowEnd(cfg, now, counts);

  const used =
    sessions.filter((s) => CONSUMES.has(s.status) && s.scheduledDate <= windowEnd).length +
    onboardingUsed;

  // Future bookings are bounded by an admin hard stop only — booking into the
  // next month is exactly what a GRACE package is for.
  const bookingEnd = cfg.hardEndDate ?? new Date(8_640_000_000_000_000);
  const upcoming = sessions.filter(
    (s) => OCCUPIES.has(s.status) && s.scheduledDate <= bookingEnd,
  ).length;

  return {
    state,
    used,
    upcoming,
    remaining: Math.max(0, totalSessions - used - upcoming),
    cycleLabel: getCycleForDate(cfg, now).label,
    /**
     * The window this result was counted over. Callers MUST reuse it rather
     * than calling getCountingWindowEnd again with `used` — that figure is
     * post-window, so feeding it back flips a GRACE package to EXHAUSTED and
     * rewinds the window to its nominal end, silently dropping sessions.
     */
    windowEnd,
  };
}

interface RawPackage {
  id: string;
  isActive: boolean;
  startDate: Date;
  endDate: Date | null;
  totalSessions: number;
  sessionsPerMonth: number;
  onboardingUsedSessions: number;
  plan: { name: string; durationDays: number } | null;
  trainer: { user: { firstName: string; lastName: string } } | null;
}

/**
 * Build one history entry per package, oldest first.
 *
 * Each consumed session is attributed to EXACTLY ONE package: the latest one
 * whose `startDate` is on or before the session. That is how a human reads it
 * ("which package was in force that day?"), and it partitions the timeline by
 * construction, so the per-package figures always sum to the lifetime total
 * no matter how the stored windows overlap.
 *
 * Overlap is not hypothetical — prod holds packages that start before the
 * previous one ended, and at least one row whose `endDate` precedes its own
 * `startDate`. A window-clipping rule silently mis-counts those; attribution
 * does not.
 */
function buildPackageHistory(
  packages: RawPackage[],
  sessions: SessionRow[],
  now: Date,
): PackageHistoryEntry[] {
  const ordered = [...packages].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  // Attribute every consumed session to the latest package that had started.
  const attributed = new Map<string, number>();
  for (const s of sessions) {
    if (!CONSUMES.has(s.status)) continue;
    let owner: RawPackage | null = null;
    for (const p of ordered) {
      if (p.startDate <= s.scheduledDate) owner = p;
      else break;
    }
    if (owner) attributed.set(owner.id, (attributed.get(owner.id) ?? 0) + 1);
  }

  return ordered.map((p, i) => {
    const cfg: CycleConfig = {
      startDate: p.startDate,
      durationDays: p.plan?.durationDays ?? 30,
      hardEndDate: p.endDate,
    };

    const own = sessions.filter((s) => s.scheduledDate >= p.startDate);
    const counts = currentPackageCounts(cfg, p.totalSessions, p.onboardingUsedSessions, own, now);

    // Display window: the package's own counting window, visually trimmed where
    // the next package takes over. This is presentation only — `used` comes
    // from attribution above, so trimming cannot drop a session.
    let windowEnd = counts.windowEnd;
    const next = ordered[i + 1];
    if (next) {
      const boundary = new Date(next.startDate.getTime() - 1);
      if (boundary < windowEnd && boundary >= p.startDate) windowEnd = boundary;
    }

    const sessionRows = attributed.get(p.id) ?? 0;
    const used = sessionRows + p.onboardingUsedSessions;

    // Only a live package can hold future bookings.
    const upcoming = p.isActive ? counts.upcoming : 0;

    const trainer = p.trainer?.user;

    return {
      id: p.id,
      isActive: p.isActive,
      planName: p.plan?.name ?? null,
      trainerName: trainer ? `${trainer.firstName} ${trainer.lastName}`.trim() : null,
      sessionsPerMonth: p.sessionsPerMonth,
      totalSessions: p.totalSessions,
      onboardingUsed: p.onboardingUsedSessions,
      startDate: p.startDate.toISOString(),
      endDate: p.endDate ? p.endDate.toISOString() : null,
      windowStart: p.startDate.toISOString(),
      windowEnd: windowEnd.toISOString(),
      state: counts.state,
      used,
      upcoming,
      remaining: Math.max(0, p.totalSessions - used - upcoming),
      sessionRows,
      windowInvalid: p.endDate != null && p.endDate < p.startDate,
    };
  });
}

/**
 * Build the full branch audit. Two queries, all grouping done in memory — a
 * per-client round trip would be ~230 queries on this branch.
 */
export async function getPackageAudit(branchId: string): Promise<{
  data: PackageAuditRow[];
  summary: PackageAuditSummary;
}> {
  const now = new Date();

  const [clients, sessions] = await Promise.all([
    prisma.clientProfile.findMany({
      where: { branchId },
      select: {
        id: true,
        user: {
          select: { firstName: true, lastName: true, email: true, isActive: true, deletedAt: true },
        },
        ptPackages: {
          select: {
            id: true,
            isActive: true,
            startDate: true,
            endDate: true,
            totalSessions: true,
            sessionsPerMonth: true,
            onboardingUsedSessions: true,
            plan: { select: { name: true, durationDays: true } },
            trainer: { select: { user: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: { startDate: 'desc' },
        },
      },
    }),
    prisma.sessionInstance.findMany({
      where: { branchId },
      select: { clientProfileId: true, status: true, scheduledDate: true },
    }),
  ]);

  const sessionsByClient = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const list = sessionsByClient.get(s.clientProfileId);
    if (list) list.push(s);
    else sessionsByClient.set(s.clientProfileId, [s]);
  }

  const data: PackageAuditRow[] = [];

  for (const c of clients) {
    if (c.user.deletedAt) continue;

    const all = sessionsByClient.get(c.id) ?? [];
    const consumed = all.filter((s) => CONSUMES.has(s.status));
    const lifetimeOnboarding = c.ptPackages.reduce((a, p) => a + p.onboardingUsedSessions, 0);
    const lifetimePaid = c.ptPackages.reduce((a, p) => a + p.totalSessions, 0);

    const lastSession = consumed.reduce<Date | null>(
      (latest, s) => (latest === null || s.scheduledDate > latest ? s.scheduledDate : latest),
      null,
    );

    // The current package: the active one, most recent first. Four clients hold
    // two active packages because of a duplicate trainer account (S7-PC-01);
    // the most recently started one is reported and `packageCount` reveals the rest.
    const active = c.ptPackages.find((p) => p.isActive) ?? null;

    // Newest first for the drawer — admins read the latest package at the top.
    const history = buildPackageHistory(c.ptPackages, all, now).reverse();

    // The active package should be the latest-starting one. When it is not,
    // packages overlap or were closed out of order, and the table's current
    // figures cannot reconcile with per-package attribution.
    const latestStart = c.ptPackages.reduce<Date | null>(
      (max, p) => (max === null || p.startDate > max ? p.startDate : max),
      null,
    );
    const packagesOverlap = active != null && latestStart != null && active.startDate < latestStart;

    const base: PackageAuditRow = {
      clientProfileId: c.id,
      clientName: `${c.user.firstName} ${c.user.lastName}`.trim(),
      email: c.user.email,
      isActive: c.user.isActive,
      trainerName: null,

      hasActivePackage: false,
      planName: null,
      sessionsPerMonth: 0,
      durationDays: 0,
      packageStart: null,
      hardEndDate: null,
      state: null,
      cycleLabel: null,
      currentPaid: 0,
      currentUsed: 0,
      currentUpcoming: 0,
      currentRemaining: 0,
      onboardingUsed: 0,

      packageCount: c.ptPackages.length,
      lifetimePaid,
      lifetimeUsed: consumed.length + lifetimeOnboarding,
      lifetimeSessionRows: consumed.length,
      lifetimeOnboarding,
      lastSessionDate: lastSession ? lastSession.toISOString() : null,
      packages: history,
      packagesOverlap,
      currentCountDiffers: false,
      unattributedUsed: Math.max(
        0,
        consumed.length + lifetimeOnboarding - history.reduce((a, h) => a + h.used, 0),
      ),
    };

    if (!active) {
      data.push(base);
      continue;
    }

    const cfg: CycleConfig = {
      startDate: active.startDate,
      // Freeform packages predate the plan catalog and have always been
      // treated as monthly; the PRD defines a "month" as 30 days.
      durationDays: active.plan?.durationDays ?? 30,
      hardEndDate: active.endDate,
    };

    // Only sessions from this package's start onward belong to it.
    const inPackage = all.filter((s) => s.scheduledDate >= active.startDate);
    const counts = currentPackageCounts(
      cfg,
      active.totalSessions,
      active.onboardingUsedSessions,
      inPackage,
      now,
    );

    const trainer = active.trainer?.user;

    data.push({
      ...base,
      trainerName: trainer ? `${trainer.firstName} ${trainer.lastName}`.trim() : null,
      hasActivePackage: true,
      planName: active.plan?.name ?? null,
      sessionsPerMonth: active.sessionsPerMonth,
      durationDays: cfg.durationDays,
      packageStart: active.startDate.toISOString(),
      hardEndDate: active.endDate ? active.endDate.toISOString() : null,
      state: counts.state,
      cycleLabel: counts.cycleLabel,
      currentPaid: active.totalSessions,
      currentUsed: counts.used,
      currentUpcoming: counts.upcoming,
      currentRemaining: counts.remaining,
      onboardingUsed: active.onboardingUsedSessions,
      currentCountDiffers: (() => {
        const cur = history.find((h) => h.isActive);
        return cur != null && cur.used !== counts.used;
      })(),
    });
  }

  data.sort((a, b) => a.clientName.localeCompare(b.clientName));

  const byState: Record<string, number> = {};
  for (const row of data) {
    const key: AuditState = row.state ?? 'NO_PACKAGE';
    byState[key] = (byState[key] ?? 0) + 1;
  }

  return {
    data,
    summary: {
      clients: data.length,
      withActivePackage: data.filter((r) => r.hasActivePackage).length,
      byState,
      lifetimePaid: data.reduce((a, r) => a + r.lifetimePaid, 0),
      lifetimeUsed: data.reduce((a, r) => a + r.lifetimeUsed, 0),
      overConsumed: data.filter((r) => r.lifetimePaid > 0 && r.lifetimeUsed > r.lifetimePaid)
        .length,
    },
  };
}
