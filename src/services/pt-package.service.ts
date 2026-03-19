import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';

interface CreatePtPackageInput {
  branchId: string;
  clientProfileId: string;
  trainerProfileId: string;
  sessionsPerMonth: number;
  sessionCharge?: number;
  startDate: string;
  actorId: string;
}

interface UpdatePtPackageInput {
  sessionsPerMonth?: number;
  sessionCharge?: number;
  isActive?: boolean;
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

  const ptPackage = await prisma.ptPackage.create({
    data: {
      branchId: input.branchId,
      clientProfileId: input.clientProfileId,
      trainerProfileId: input.trainerProfileId,
      sessionsPerMonth: input.sessionsPerMonth,
      sessionChargeAmount: input.sessionCharge ?? null,
      startDate: new Date(input.startDate),
    },
    include: {
      client: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      trainer: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
    },
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

  const packages = await prisma.ptPackage.findMany({
    where,
    include: {
      client: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      trainer: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
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
  if (input.sessionCharge !== undefined) data.sessionChargeAmount = input.sessionCharge;
  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
    if (!input.isActive) {
      data.endDate = new Date();
    }
  }

  const updated = await prisma.ptPackage.update({
    where: { id },
    data,
    include: {
      client: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
      trainer: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
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
      sessionChargeAmount: existing.sessionChargeAmount,
      isActive: existing.isActive,
    },
    newValue: {
      sessionsPerMonth: updated.sessionsPerMonth,
      sessionChargeAmount: updated.sessionChargeAmount,
      isActive: updated.isActive,
    },
  });

  return updated;
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
