import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';

interface CreatePackagePlanInput {
  branchId: string;
  actorId: string;
  name: string;
  sessionsPerMonth: number;
  pricePerCycle: number;
  sessionChargeAmount?: number;
  durationDays: number;
  description?: string;
}

interface UpdatePackagePlanInput {
  name?: string;
  sessionsPerMonth?: number;
  pricePerCycle?: number;
  sessionChargeAmount?: number;
  durationDays?: number;
  description?: string;
  isActive?: boolean;
}

interface ListPackagePlansInput {
  branchId: string;
  activeOnly?: boolean;
  page?: number;
  pageSize?: number;
}

/**
 * Create a new PT package plan in the catalog.
 */
export async function createPlan(input: CreatePackagePlanInput) {
  const duplicate = await prisma.ptPackagePlan.findUnique({
    where: { branchId_name: { branchId: input.branchId, name: input.name } },
  });
  if (duplicate) {
    throw new AppError(
      'DUPLICATE_PLAN_NAME',
      `A plan named "${input.name}" already exists in this branch`,
      409,
    );
  }

  const plan = await prisma.ptPackagePlan.create({
    data: {
      branchId: input.branchId,
      name: input.name,
      sessionsPerMonth: input.sessionsPerMonth,
      pricePerCycle: input.pricePerCycle,
      sessionChargeAmount: input.sessionChargeAmount ?? null,
      durationDays: input.durationDays,
      description: input.description ?? null,
    },
  });

  await auditLog({
    action: 'PT_PACKAGE_PLAN_CREATED',
    actorId: input.actorId,
    subjectType: 'PtPackagePlan',
    subjectId: plan.id,
    branchId: input.branchId,
    newValue: {
      name: plan.name,
      sessionsPerMonth: plan.sessionsPerMonth,
      pricePerCycle: plan.pricePerCycle,
      sessionChargeAmount: plan.sessionChargeAmount,
      durationDays: plan.durationDays,
    },
  });

  return plan;
}

/**
 * List package plans for a branch, optionally filtered to active-only.
 * Includes assignment count for admin UI.
 */
export async function getPlans(input: ListPackagePlansInput) {
  const where: Record<string, unknown> = { branchId: input.branchId };
  if (input.activeOnly) where.isActive = true;

  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;

  const [data, total] = await Promise.all([
    prisma.ptPackagePlan.findMany({
      where,
      include: {
        _count: { select: { packages: { where: { isActive: true } } } },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ptPackagePlan.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Fetch a single plan with its active-assignment count.
 */
export async function getPlanById(id: string, branchId: string) {
  const plan = await prisma.ptPackagePlan.findFirst({
    where: { id, branchId },
    include: {
      _count: { select: { packages: { where: { isActive: true } } } },
    },
  });

  if (!plan) {
    throw new AppError('PLAN_NOT_FOUND', 'Package plan not found', 404);
  }

  return plan;
}

/**
 * Update a package plan's fields.
 */
export async function updatePlan(
  id: string,
  branchId: string,
  actorId: string,
  input: UpdatePackagePlanInput,
) {
  const existing = await prisma.ptPackagePlan.findFirst({ where: { id, branchId } });
  if (!existing) {
    throw new AppError('PLAN_NOT_FOUND', 'Package plan not found', 404);
  }

  // Guard against renaming to a name already used in this branch
  if (input.name && input.name !== existing.name) {
    const duplicate = await prisma.ptPackagePlan.findUnique({
      where: { branchId_name: { branchId, name: input.name } },
    });
    if (duplicate) {
      throw new AppError(
        'DUPLICATE_PLAN_NAME',
        `A plan named "${input.name}" already exists in this branch`,
        409,
      );
    }
  }

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.sessionsPerMonth !== undefined) data.sessionsPerMonth = input.sessionsPerMonth;
  if (input.pricePerCycle !== undefined) data.pricePerCycle = input.pricePerCycle;
  if (input.sessionChargeAmount !== undefined) data.sessionChargeAmount = input.sessionChargeAmount;
  if (input.durationDays !== undefined) data.durationDays = input.durationDays;
  if (input.description !== undefined) data.description = input.description;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const updated = await prisma.ptPackagePlan.update({ where: { id }, data });

  await auditLog({
    action: 'PT_PACKAGE_PLAN_UPDATED',
    actorId,
    subjectType: 'PtPackagePlan',
    subjectId: id,
    branchId,
    oldValue: {
      name: existing.name,
      sessionsPerMonth: existing.sessionsPerMonth,
      pricePerCycle: existing.pricePerCycle,
      sessionChargeAmount: existing.sessionChargeAmount,
      durationDays: existing.durationDays,
      isActive: existing.isActive,
    },
    newValue: {
      name: updated.name,
      sessionsPerMonth: updated.sessionsPerMonth,
      pricePerCycle: updated.pricePerCycle,
      sessionChargeAmount: updated.sessionChargeAmount,
      durationDays: updated.durationDays,
      isActive: updated.isActive,
    },
  });

  return updated;
}

/**
 * Deactivate a plan (soft — sets isActive=false).
 * Rejects with 409 if active PtPackage assignments still reference the plan,
 * unless `force=true` (active assignments keep their planId for historical reference;
 * the plan simply becomes invisible in the dropdown for new assignments).
 */
export async function deactivatePlan(id: string, branchId: string, actorId: string, force = false) {
  const existing = await prisma.ptPackagePlan.findFirst({ where: { id, branchId } });
  if (!existing) {
    throw new AppError('PLAN_NOT_FOUND', 'Package plan not found', 404);
  }

  if (!existing.isActive) {
    return { success: true, alreadyInactive: true };
  }

  const activeAssignments = await prisma.ptPackage.count({
    where: { branchId, planId: id, isActive: true },
  });

  if (activeAssignments > 0 && !force) {
    throw new AppError(
      'PLAN_HAS_ACTIVE_ASSIGNMENTS',
      `${activeAssignments} active assignment${activeAssignments === 1 ? '' : 's'} still reference this plan. Pass force=true to deactivate anyway (existing assignments keep their planId).`,
      409,
    );
  }

  await prisma.ptPackagePlan.update({
    where: { id },
    data: { isActive: false },
  });

  await auditLog({
    action: 'PT_PACKAGE_PLAN_DEACTIVATED',
    actorId,
    subjectType: 'PtPackagePlan',
    subjectId: id,
    branchId,
    oldValue: { isActive: true },
    newValue: { isActive: false },
    metadata: { force, activeAssignments },
  });

  return { success: true };
}
