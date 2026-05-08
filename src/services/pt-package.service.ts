import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { sendNotification } from '@/lib/notifications';
import { AppError } from '@/lib/errors';

interface CreatePtPackageInput {
  branchId: string;
  clientProfileId: string;
  trainerProfileId: string;
  planId?: string;
  sessionsPerMonth: number;
  totalSessions?: number;
  onboardingUsedSessions?: number;
  onboardingNotes?: string;
  carryForwardLimit?: number | null;
  sessionCharge?: number;
  startDate: string;
  endDate?: string;
  actorId: string;
}

interface UpdatePtPackageInput {
  planId?: string | null;
  sessionsPerMonth?: number;
  totalSessions?: number;
  onboardingUsedSessions?: number;
  onboardingNotes?: string | null;
  carryForwardLimit?: number | null;
  sessionCharge?: number;
  endDate?: string | null;
  isActive?: boolean;
}

/**
 * Compute the total number of sessions for a package window from the plan
 * rate (sessions/month) and duration. Used when admin doesn't override.
 */
function computeTotalSessionsFromPlan(sessionsPerMonth: number, durationDays: number): number {
  return Math.round((sessionsPerMonth * durationDays) / 30);
}

interface ListPtPackagesInput {
  branchId: string;
  trainerId?: string;
  clientId?: string;
}

/**
 * Create a new trainer-client PT package mapping.
 */
export async function createPtPackage(input: CreatePtPackageInput) {
  // Verify client profile exists and belongs to the same branch
  const client = await prisma.clientProfile.findFirst({
    where: { id: input.clientProfileId, branchId: input.branchId },
  });
  if (!client) {
    throw new AppError('CLIENT_NOT_FOUND', 'Client profile not found', 404);
  }

  // Verify trainer profile exists and belongs to the same branch
  const trainer = await prisma.trainerProfile.findFirst({
    where: { id: input.trainerProfileId, branchId: input.branchId },
  });
  if (!trainer) {
    throw new AppError('TRAINER_NOT_FOUND', 'Trainer profile not found', 404);
  }

  // Check for duplicate active mapping
  const existing = await prisma.ptPackage.findFirst({
    where: {
      branchId: input.branchId,
      clientProfileId: input.clientProfileId,
      trainerProfileId: input.trainerProfileId,
      isActive: true,
    },
  });
  if (existing) {
    throw new AppError(
      'DUPLICATE_MAPPING',
      'An active mapping already exists for this trainer-client pair',
      409,
    );
  }

  // If planId is provided, verify it belongs to this branch and is active.
  // Also fetch durationDays so we can auto-compute totalSessions when admin
  // didn't supply an override.
  let planDurationDays: number | null = null;
  if (input.planId) {
    const plan = await prisma.ptPackagePlan.findFirst({
      where: { id: input.planId, branchId: input.branchId },
      select: { isActive: true, durationDays: true },
    });
    if (!plan) {
      throw new AppError('PLAN_NOT_FOUND', 'Selected package plan not found', 404);
    }
    if (!plan.isActive) {
      throw new AppError('PLAN_INACTIVE', 'Selected package plan is no longer active', 400);
    }
    planDurationDays = plan.durationDays;
  }

  // Resolve totalSessions: explicit override > computed from plan > sessionsPerMonth
  const totalSessions =
    input.totalSessions ??
    (planDurationDays != null
      ? computeTotalSessionsFromPlan(input.sessionsPerMonth, planDurationDays)
      : input.sessionsPerMonth);

  const ptPackage = await prisma.ptPackage.create({
    data: {
      branchId: input.branchId,
      clientProfileId: input.clientProfileId,
      trainerProfileId: input.trainerProfileId,
      planId: input.planId ?? null,
      sessionsPerMonth: input.sessionsPerMonth,
      totalSessions,
      onboardingUsedSessions: input.onboardingUsedSessions ?? 0,
      onboardingNotes: input.onboardingNotes ?? null,
      carryForwardLimit: input.carryForwardLimit ?? null,
      sessionChargeAmount: input.sessionCharge ?? null,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
    },
    include: {
      client: {
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      },
      trainer: {
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      },
      plan: { select: { id: true, name: true } },
    },
  });

  const trainerName = `${ptPackage.trainer.user.firstName} ${ptPackage.trainer.user.lastName}`;
  const clientName = `${ptPackage.client.user.firstName} ${ptPackage.client.user.lastName}`;
  const startFormatted = new Date(input.startDate).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // Notify trainer
  await sendNotification({
    branchId: input.branchId,
    recipientId: ptPackage.trainer.user.id,
    title: `New client — ${clientName}`,
    body: `${input.sessionsPerMonth} sessions/month • from ${startFormatted}`,
    channel: 'BOTH',
    metadata: { ptPackageId: ptPackage.id, clientProfileId: input.clientProfileId },
  });

  // Notify client
  await sendNotification({
    branchId: input.branchId,
    recipientId: ptPackage.client.user.id,
    title: `Your trainer — ${trainerName}`,
    body: `${input.sessionsPerMonth} sessions/month • from ${startFormatted}`,
    channel: 'BOTH',
    metadata: { ptPackageId: ptPackage.id, trainerProfileId: input.trainerProfileId },
  });

  await auditLog({
    action: 'PT_PACKAGE_CREATED',
    actorId: input.actorId,
    subjectType: 'PtPackage',
    subjectId: ptPackage.id,
    branchId: input.branchId,
    newValue: {
      clientProfileId: input.clientProfileId,
      trainerProfileId: input.trainerProfileId,
      sessionsPerMonth: input.sessionsPerMonth,
      sessionCharge: input.sessionCharge ?? null,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
    },
  });

  return ptPackage;
}

/**
 * List PT packages filtered by trainer and/or client.
 */
export async function getPtPackages(input: ListPtPackagesInput) {
  const where: Record<string, unknown> = {
    branchId: input.branchId,
  };

  if (input.trainerId) {
    where.trainerProfileId = input.trainerId;
  }
  if (input.clientId) {
    where.clientProfileId = input.clientId;
  }

  // Lazy expiry: deactivate any packages whose endDate has passed
  await prisma.ptPackage.updateMany({
    where: {
      branchId: input.branchId,
      isActive: true,
      endDate: { lt: new Date() },
    },
    data: { isActive: false },
  });

  const packages = await prisma.ptPackage.findMany({
    where,
    include: {
      client: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      trainer: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      plan: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return { data: packages };
}

/**
 * Get a single PT package by ID (branch scoped).
 */
export async function getPtPackageById(id: string, branchId: string) {
  const ptPackage = await prisma.ptPackage.findFirst({
    where: { id, branchId },
    include: {
      client: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      trainer: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      plan: { select: { id: true, name: true } },
    },
  });

  if (!ptPackage) {
    throw new AppError('PT_PACKAGE_NOT_FOUND', 'PT package not found', 404);
  }

  return ptPackage;
}

/**
 * Update a PT package (sessions per month, charge, active status).
 */
export async function updatePtPackage(
  id: string,
  branchId: string,
  actorId: string,
  input: UpdatePtPackageInput,
) {
  const existing = await prisma.ptPackage.findFirst({
    where: { id, branchId },
  });
  if (!existing) {
    throw new AppError('PT_PACKAGE_NOT_FOUND', 'PT package not found', 404);
  }

  const data: Record<string, unknown> = {};
  if (input.sessionsPerMonth !== undefined) data.sessionsPerMonth = input.sessionsPerMonth;
  if (input.totalSessions !== undefined) data.totalSessions = input.totalSessions;
  if (input.onboardingUsedSessions !== undefined)
    data.onboardingUsedSessions = input.onboardingUsedSessions;
  if ('onboardingNotes' in input) data.onboardingNotes = input.onboardingNotes ?? null;
  if ('carryForwardLimit' in input) data.carryForwardLimit = input.carryForwardLimit;
  if (input.sessionCharge !== undefined) data.sessionChargeAmount = input.sessionCharge;
  if ('endDate' in input) {
    data.endDate = input.endDate ? new Date(input.endDate) : null;
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
    if (!input.isActive && !('endDate' in input)) {
      data.endDate = new Date();
    }
  }
  if ('planId' in input) {
    if (input.planId) {
      const plan = await prisma.ptPackagePlan.findFirst({
        where: { id: input.planId, branchId },
        select: { isActive: true },
      });
      if (!plan) {
        throw new AppError('PLAN_NOT_FOUND', 'Selected package plan not found', 404);
      }
      if (!plan.isActive) {
        throw new AppError('PLAN_INACTIVE', 'Selected package plan is no longer active', 400);
      }
    }
    data.planId = input.planId;
  }

  const updated = await prisma.ptPackage.update({
    where: { id },
    data,
    include: {
      client: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      trainer: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      plan: { select: { id: true, name: true } },
    },
  });

  await auditLog({
    action: 'PT_PACKAGE_UPDATED',
    actorId,
    subjectType: 'PtPackage',
    subjectId: id,
    branchId,
    oldValue: {
      sessionsPerMonth: existing.sessionsPerMonth,
      totalSessions: existing.totalSessions,
      onboardingUsedSessions: existing.onboardingUsedSessions,
      carryForwardLimit: existing.carryForwardLimit,
      sessionChargeAmount: existing.sessionChargeAmount,
      isActive: existing.isActive,
    },
    newValue: {
      sessionsPerMonth: updated.sessionsPerMonth,
      totalSessions: updated.totalSessions,
      onboardingUsedSessions: updated.onboardingUsedSessions,
      carryForwardLimit: updated.carryForwardLimit,
      sessionChargeAmount: updated.sessionChargeAmount,
      isActive: updated.isActive,
    },
  });

  return updated;
}

/**
 * Compute session counts and timing math for the full package window
 * (`startDate` → `endDate`). Replaces calendar-month-based counters in
 * surfaces that need to reflect the actual gym membership cycle.
 *
 * - used = COMPLETED + NO_SHOW within the window + onboardingUsedSessions
 * - scheduled = SCHEDULED + IN_PROGRESS within the window
 * - remaining = totalSessions - used - scheduled
 */
export async function getPackageWindowCounts(ptPackageId: string, branchId: string) {
  const pkg = await prisma.ptPackage.findFirst({
    where: { id: ptPackageId, branchId },
    select: {
      id: true,
      clientProfileId: true,
      trainerProfileId: true,
      sessionsPerMonth: true,
      totalSessions: true,
      onboardingUsedSessions: true,
      onboardingNotes: true,
      startDate: true,
      endDate: true,
      isActive: true,
      plan: { select: { id: true, name: true, durationDays: true } },
    },
  });

  if (!pkg) {
    throw new AppError('PT_PACKAGE_NOT_FOUND', 'PT package not found', 404);
  }

  const windowStart = pkg.startDate;
  const windowEnd = pkg.endDate ?? new Date(windowStart.getTime() + 30 * 24 * 60 * 60 * 1000);

  const sessions = await prisma.sessionInstance.findMany({
    where: {
      branchId,
      clientProfileId: pkg.clientProfileId,
      scheduledDate: { gte: windowStart, lte: windowEnd },
    },
    select: { status: true },
  });

  const completed = sessions.filter((s) => s.status === 'COMPLETED').length;
  const noShow = sessions.filter((s) => s.status === 'NO_SHOW').length;
  const cancelled = sessions.filter((s) => s.status === 'CANCELLED').length;
  const scheduled = sessions.filter((s) => s.status === 'SCHEDULED').length;
  const inProgress = sessions.filter((s) => s.status === 'IN_PROGRESS').length;

  const used = completed + noShow + pkg.onboardingUsedSessions;
  const upcoming = scheduled + inProgress;
  const remaining = Math.max(0, pkg.totalSessions - used - upcoming);

  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;
  const totalDays = Math.max(
    1,
    Math.round((windowEnd.getTime() - windowStart.getTime()) / msPerDay),
  );
  const daysElapsed = Math.max(
    0,
    Math.min(totalDays, Math.floor((now.getTime() - windowStart.getTime()) / msPerDay)),
  );
  const daysRemaining = Math.max(0, Math.ceil((windowEnd.getTime() - now.getTime()) / msPerDay));

  return {
    packageId: pkg.id,
    plan: pkg.plan,
    sessionsPerMonth: pkg.sessionsPerMonth,
    totalSessions: pkg.totalSessions,
    onboardingUsedSessions: pkg.onboardingUsedSessions,
    onboardingNotes: pkg.onboardingNotes,
    completed,
    noShow,
    cancelled,
    scheduled,
    inProgress,
    used,
    upcoming,
    remaining,
    window: {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
      totalDays,
      daysElapsed,
      daysRemaining,
    },
  };
}

/**
 * Deactivate a PT package (soft delete — sets isActive=false and endDate).
 */
export async function deletePtPackage(id: string, branchId: string, actorId: string) {
  const existing = await prisma.ptPackage.findFirst({
    where: { id, branchId },
  });
  if (!existing) {
    throw new AppError('PT_PACKAGE_NOT_FOUND', 'PT package not found', 404);
  }

  const updated = await prisma.ptPackage.update({
    where: { id },
    data: { isActive: false, endDate: new Date() },
  });

  await auditLog({
    action: 'PT_PACKAGE_DEACTIVATED',
    actorId,
    subjectType: 'PtPackage',
    subjectId: id,
    branchId,
    oldValue: { isActive: true },
    newValue: { isActive: false, endDate: updated.endDate?.toISOString() ?? null },
  });

  return { success: true };
}
