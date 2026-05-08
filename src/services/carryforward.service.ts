import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';

// ─── Types ──────────────────────────────────────────

interface ClientConsumptionSummary {
  clientProfileId: string;
  clientName: string;
  sessionsPerMonth: number;
  total: number;
  completed: number;
  noShow: number;
  cancelled: number;
  scheduled: number;
  used: number;
  unused: number;
  carryForwardIn: number; // carry-forward sessions received this month
  eligibleCarryForward: number; // how many can carry to next month
}

interface MonthEndResult {
  processed: number;
  carryForwardCreated: number;
  expired: number;
  details: {
    clientProfileId: string;
    clientName: string;
    unused: number;
    carriedForward: number;
    expired: number;
  }[];
}

// ─── Helpers ────────────────────────────────────────

function getMonthRange(month: string) {
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr!, 10);
  const m = parseInt(monthStr!, 10);
  return {
    start: new Date(year, m - 1, 1),
    end: new Date(year, m, 0, 23, 59, 59),
  };
}

function getNextMonth(month: string): string {
  const [yearStr, monthStr] = month.split('-');
  let year = parseInt(yearStr!, 10);
  let m = parseInt(monthStr!, 10);
  m += 1;
  if (m > 12) {
    m = 1;
    year += 1;
  }
  return `${year}-${String(m).padStart(2, '0')}`;
}

// ─── Session Consumption Summary ────────────────────

export async function getConsumptionSummary(branchId: string, month: string) {
  const { start, end } = getMonthRange(month);

  // Get all active PT packages for this branch
  const packages = await prisma.ptPackage.findMany({
    where: { branchId, isActive: true },
    include: {
      client: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  const summaries: ClientConsumptionSummary[] = [];

  for (const pkg of packages) {
    const sessions = await prisma.sessionInstance.findMany({
      where: {
        branchId,
        clientProfileId: pkg.clientProfileId,
        scheduledDate: { gte: start, lte: end },
      },
      select: { status: true, isCarryForward: true },
    });

    const completed = sessions.filter((s) => s.status === 'COMPLETED').length;
    const noShow = sessions.filter((s) => s.status === 'NO_SHOW').length;
    const cancelled = sessions.filter((s) => s.status === 'CANCELLED').length;
    const scheduled = sessions.filter(
      (s) => s.status === 'SCHEDULED' || s.status === 'IN_PROGRESS',
    ).length;
    const used = completed + noShow;
    const carryForwardIn = sessions.filter((s) => s.isCarryForward).length;
    const total = sessions.length;
    const unused = Math.max(0, total - used - cancelled);

    // Get branch carry-forward limit
    const settings = await prisma.branchSettings.findUnique({
      where: { branchId },
      select: { carryForwardLimit: true },
    });
    const limit = settings?.carryForwardLimit ?? 3;
    const eligibleCarryForward = Math.min(unused, limit);

    summaries.push({
      clientProfileId: pkg.clientProfileId,
      clientName: `${pkg.client.user.firstName} ${pkg.client.user.lastName}`,
      sessionsPerMonth: pkg.sessionsPerMonth,
      total,
      completed,
      noShow,
      cancelled,
      scheduled,
      used,
      unused,
      carryForwardIn,
      eligibleCarryForward,
    });
  }

  return summaries;
}

// ─── Month-End Processing ───────────────────────────

export async function processMonthEnd(
  branchId: string,
  month: string,
  actorId: string,
): Promise<MonthEndResult> {
  const { start, end } = getMonthRange(month);
  const nextMonthStr = getNextMonth(month);
  const nextMonthStart = getMonthRange(nextMonthStr).start;

  // Check if already processed for this month
  const existingCarryForwards = await prisma.sessionInstance.count({
    where: {
      branchId,
      isCarryForward: true,
      carryForwardFromMonth: {
        gte: start,
        lte: end,
      },
    },
  });

  if (existingCarryForwards > 0) {
    throw new AppError(
      'ALREADY_PROCESSED',
      `Month-end for ${month} has already been processed (${existingCarryForwards} carry-forward sessions exist)`,
      409,
    );
  }

  // Get branch settings
  const settings = await prisma.branchSettings.findUnique({
    where: { branchId },
    select: { carryForwardLimit: true, defaultSessionDurationMin: true },
  });
  const carryForwardLimit = settings?.carryForwardLimit ?? 3;
  const defaultDuration = settings?.defaultSessionDurationMin ?? 60;

  // Get all active PT packages
  const packages = await prisma.ptPackage.findMany({
    where: { branchId, isActive: true },
    include: {
      client: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  const result: MonthEndResult = {
    processed: 0,
    carryForwardCreated: 0,
    expired: 0,
    details: [],
  };

  for (const pkg of packages) {
    // Count sessions for this month
    const sessions = await prisma.sessionInstance.findMany({
      where: {
        branchId,
        clientProfileId: pkg.clientProfileId,
        scheduledDate: { gte: start, lte: end },
      },
      select: { status: true },
    });

    const completed = sessions.filter((s) => s.status === 'COMPLETED').length;
    const noShow = sessions.filter((s) => s.status === 'NO_SHOW').length;
    const cancelled = sessions.filter((s) => s.status === 'CANCELLED').length;
    const used = completed + noShow;
    const total = sessions.length;
    const unused = Math.max(0, total - used - cancelled);

    const toCarryForward = Math.min(unused, carryForwardLimit);
    const expired = unused - toCarryForward;

    // Create carry-forward sessions for next month
    if (toCarryForward > 0) {
      const carryForwardSessions = Array.from({ length: toCarryForward }, (_, i) => ({
        branchId,
        clientProfileId: pkg.clientProfileId,
        trainerProfileId: pkg.trainerProfileId,
        scheduledDate: nextMonthStart,
        scheduledTime: '00:00', // placeholder — admin reschedules
        durationMin: defaultDuration,
        status: 'SCHEDULED' as const,
        isCarryForward: true,
        carryForwardFromMonth: start,
        notes: `Carry-forward #${i + 1} from ${month}`,
      }));

      await prisma.sessionInstance.createMany({
        data: carryForwardSessions,
      });

      result.carryForwardCreated += toCarryForward;
    }

    result.expired += expired;
    result.processed += 1;

    const clientName = `${pkg.client.user.firstName} ${pkg.client.user.lastName}`;
    result.details.push({
      clientProfileId: pkg.clientProfileId,
      clientName,
      unused,
      carriedForward: toCarryForward,
      expired,
    });
  }

  await auditLog({
    action: 'MONTH_END_PROCESSED',
    actorId,
    subjectType: 'Branch',
    subjectId: branchId,
    branchId,
    newValue: {
      month,
      processed: result.processed,
      carryForwardCreated: result.carryForwardCreated,
      expired: result.expired,
    },
  });

  return result;
}

// ─── Cycle-End Processing (Phase 24, ADR-029 / ADR-030) ──────────────

interface CycleEndDetail {
  packageId: string;
  clientProfileId: string;
  clientName: string;
  totalSessions: number;
  used: number;
  unused: number;
  effectiveLimit: number;
  carryForwardOutSessions: number;
  expired: number;
}

interface CycleEndResult {
  processed: number;
  totalCarriedForward: number;
  totalExpired: number;
  details: CycleEndDetail[];
}

/**
 * Walk all active PT packages whose `endDate` is in the past and which haven't
 * been cycle-processed yet (or whose endDate is newer than the last processing
 * run). For each such package:
 *   - used = COMPLETED + NO_SHOW within the window + onboardingUsedSessions
 *   - unused = max(0, totalSessions - used)
 *   - effectiveLimit = pkg.carryForwardLimit ?? branchSettings.carryForwardLimit ?? 3
 *   - carryForwardOutSessions = min(unused, effectiveLimit)
 *
 * Re-runs are no-ops thanks to the `lastProcessedAt > endDate` guard. The
 * carry-forward credit lives on the expiring package; the admin (or a future
 * `applyCarryForwardCredit` flow) reads it when creating the next mapping.
 *
 * Designed for cron use; safe to invoke manually for a single branch.
 */
export async function processCycleEndsForPackages(
  branchId: string | null,
  actorId: string,
): Promise<CycleEndResult> {
  const now = new Date();

  const expiredPackages = await prisma.ptPackage.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      isActive: true,
      endDate: { lt: now, not: null },
      OR: [{ lastProcessedAt: null }, { lastProcessedAt: { lt: prisma.ptPackage.fields.endDate } }],
    },
    include: {
      client: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  // Cache branch carry-forward defaults so we don't re-fetch per package
  const branchDefaults = new Map<string, number>();
  async function getBranchDefault(bId: string): Promise<number> {
    if (branchDefaults.has(bId)) return branchDefaults.get(bId)!;
    const settings = await prisma.branchSettings.findUnique({
      where: { branchId: bId },
      select: { carryForwardLimit: true },
    });
    const limit = settings?.carryForwardLimit ?? 3;
    branchDefaults.set(bId, limit);
    return limit;
  }

  const result: CycleEndResult = {
    processed: 0,
    totalCarriedForward: 0,
    totalExpired: 0,
    details: [],
  };

  for (const pkg of expiredPackages) {
    if (!pkg.endDate) continue; // belt-and-braces; query already excludes nulls

    // Count sessions inside the package window
    const sessions = await prisma.sessionInstance.findMany({
      where: {
        branchId: pkg.branchId,
        clientProfileId: pkg.clientProfileId,
        scheduledDate: { gte: pkg.startDate, lte: pkg.endDate },
      },
      select: { status: true },
    });

    const completed = sessions.filter((s) => s.status === 'COMPLETED').length;
    const noShow = sessions.filter((s) => s.status === 'NO_SHOW').length;
    const used = completed + noShow + pkg.onboardingUsedSessions;
    const unused = Math.max(0, pkg.totalSessions - used);

    const branchLimit = await getBranchDefault(pkg.branchId);
    const effectiveLimit = pkg.carryForwardLimit ?? branchLimit;
    const carryForward = Math.min(unused, effectiveLimit);
    const expired = unused - carryForward;

    await prisma.ptPackage.update({
      where: { id: pkg.id },
      data: {
        carryForwardOutSessions: carryForward,
        lastProcessedAt: now,
      },
    });

    await auditLog({
      action: 'PT_PACKAGE_CYCLE_PROCESSED',
      actorId,
      subjectType: 'PtPackage',
      subjectId: pkg.id,
      branchId: pkg.branchId,
      newValue: {
        totalSessions: pkg.totalSessions,
        used,
        unused,
        effectiveLimit,
        carryForwardOutSessions: carryForward,
        expired,
      },
      metadata: {
        clientProfileId: pkg.clientProfileId,
        windowStart: pkg.startDate.toISOString(),
        windowEnd: pkg.endDate.toISOString(),
      },
    });

    result.processed += 1;
    result.totalCarriedForward += carryForward;
    result.totalExpired += expired;
    result.details.push({
      packageId: pkg.id,
      clientProfileId: pkg.clientProfileId,
      clientName: `${pkg.client.user.firstName} ${pkg.client.user.lastName}`,
      totalSessions: pkg.totalSessions,
      used,
      unused,
      effectiveLimit,
      carryForwardOutSessions: carryForward,
      expired,
    });
  }

  return result;
}
