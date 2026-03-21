import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import type { KickboxingClientType, Prisma } from '@prisma/client';

// ─── Class CRUD ─────────────────────────────────────

interface CreateClassInput {
  branchId: string;
  trainerProfileId: string;
  dayOfWeek: string;
  startTime: string;
  durationMin: number;
  maxCapacity: number;
  actorId: string;
}

export async function createKickboxingClass(input: CreateClassInput) {
  const { branchId, actorId, ...data } = input;

  // Verify trainer exists and is a kickboxing trainer
  const trainer = await prisma.trainerProfile.findFirst({
    where: { id: data.trainerProfileId, branchId },
    include: { user: { select: { role: true } } },
  });

  if (!trainer) {
    throw new AppError('NOT_FOUND', 'Trainer not found', 404);
  }

  const kbClass = await prisma.kickboxingClass.create({
    data: {
      branchId,
      trainerProfileId: data.trainerProfileId,
      dayOfWeek: data.dayOfWeek as Prisma.EnumDayOfWeekFieldUpdateOperationsInput['set'] & string,
      startTime: data.startTime,
      durationMin: data.durationMin,
      maxCapacity: data.maxCapacity,
    },
    include: {
      trainer: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      _count: { select: { enrollments: true } },
    },
  });

  await auditLog({
    action: 'KICKBOXING_CLASS_CREATED',
    actorId,
    subjectType: 'KickboxingClass',
    subjectId: kbClass.id,
    newValue: {
      dayOfWeek: kbClass.dayOfWeek,
      startTime: kbClass.startTime,
      trainerProfileId: kbClass.trainerProfileId,
    },
    branchId,
  });

  return kbClass;
}

export async function getKickboxingClasses(branchId: string) {
  return prisma.kickboxingClass.findMany({
    where: { branchId },
    include: {
      trainer: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}

interface UpdateClassInput {
  trainerProfileId?: string;
  dayOfWeek?: string;
  startTime?: string;
  durationMin?: number;
  maxCapacity?: number;
  isActive?: boolean;
}

export async function updateKickboxingClass(
  id: string,
  input: UpdateClassInput,
  branchId: string,
  actorId: string,
) {
  const existing = await prisma.kickboxingClass.findFirst({
    where: { id, branchId },
  });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'Kickboxing class not found', 404);
  }

  const updateData: Prisma.KickboxingClassUpdateInput = {};
  if (input.trainerProfileId !== undefined)
    updateData.trainer = { connect: { id: input.trainerProfileId } };
  if (input.dayOfWeek !== undefined)
    updateData.dayOfWeek =
      input.dayOfWeek as Prisma.EnumDayOfWeekFieldUpdateOperationsInput['set'] & string;
  if (input.startTime !== undefined) updateData.startTime = input.startTime;
  if (input.durationMin !== undefined) updateData.durationMin = input.durationMin;
  if (input.maxCapacity !== undefined) updateData.maxCapacity = input.maxCapacity;
  if (input.isActive !== undefined) updateData.isActive = input.isActive;

  const updated = await prisma.kickboxingClass.update({
    where: { id },
    data: updateData,
    include: {
      trainer: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
  });

  await auditLog({
    action: 'KICKBOXING_CLASS_UPDATED',
    actorId,
    subjectType: 'KickboxingClass',
    subjectId: id,
    oldValue: {
      dayOfWeek: existing.dayOfWeek,
      startTime: existing.startTime,
      isActive: existing.isActive,
    },
    newValue: { ...input },
    branchId,
  });

  return updated;
}

// ─── Enrollment CRUD ────────────────────────────────

interface CreateEnrollmentInput {
  branchId: string;
  classId: string;
  clientProfileId?: string;
  clientType: KickboxingClientType;
  externalName?: string;
  externalPhone?: string;
  actorId: string;
}

export async function createKickboxingEnrollment(input: CreateEnrollmentInput) {
  const { branchId, actorId, ...data } = input;

  // Verify class exists
  const kbClass = await prisma.kickboxingClass.findFirst({
    where: { id: data.classId, branchId, isActive: true },
    include: { _count: { select: { enrollments: { where: { isActive: true } } } } },
  });

  if (!kbClass) {
    throw new AppError('NOT_FOUND', 'Kickboxing class not found', 404);
  }

  // Check capacity
  if (kbClass._count.enrollments >= kbClass.maxCapacity) {
    throw new AppError('CAPACITY_FULL', 'Class has reached maximum capacity', 400);
  }

  // For GYM_MEMBER, verify client profile exists
  if (data.clientType === 'GYM_MEMBER') {
    if (!data.clientProfileId) {
      throw new AppError('VALIDATION_ERROR', 'clientProfileId is required for GYM_MEMBER', 400);
    }
    const client = await prisma.clientProfile.findFirst({
      where: { id: data.clientProfileId, branchId },
    });
    if (!client) {
      throw new AppError('NOT_FOUND', 'Client not found', 404);
    }

    // Check duplicate enrollment
    const existingEnrollment = await prisma.kickboxingEnrollment.findFirst({
      where: { classId: data.classId, clientProfileId: data.clientProfileId, isActive: true },
    });
    if (existingEnrollment) {
      throw new AppError('DUPLICATE', 'Client is already enrolled in this class', 409);
    }
  } else {
    // EXTERNAL_ONLY — require name
    if (!data.externalName) {
      throw new AppError('VALIDATION_ERROR', 'externalName is required for EXTERNAL_ONLY', 400);
    }
  }

  const enrollment = await prisma.kickboxingEnrollment.create({
    data: {
      branchId,
      classId: data.classId,
      clientProfileId: data.clientProfileId ?? null,
      clientType: data.clientType,
      externalName: data.externalName,
      externalPhone: data.externalPhone,
    },
    include: {
      client: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  await auditLog({
    action: 'KICKBOXING_ENROLLMENT_CREATED',
    actorId,
    subjectType: 'KickboxingEnrollment',
    subjectId: enrollment.id,
    newValue: {
      classId: data.classId,
      clientType: data.clientType,
      clientProfileId: data.clientProfileId,
      externalName: data.externalName,
    },
    branchId,
  });

  return enrollment;
}

interface ListEnrollmentsInput {
  branchId: string;
  classId?: string;
  clientType?: KickboxingClientType;
}

export async function getKickboxingEnrollments(input: ListEnrollmentsInput) {
  const { branchId, classId, clientType } = input;

  return prisma.kickboxingEnrollment.findMany({
    where: {
      branchId,
      isActive: true,
      ...(classId ? { classId } : {}),
      ...(clientType ? { clientType } : {}),
    },
    include: {
      client: {
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      },
      class: {
        select: { dayOfWeek: true, startTime: true, durationMin: true },
      },
    },
    orderBy: { enrolledAt: 'desc' },
  });
}

export async function deleteKickboxingEnrollment(id: string, branchId: string, actorId: string) {
  const enrollment = await prisma.kickboxingEnrollment.findFirst({
    where: { id, branchId },
  });

  if (!enrollment) {
    throw new AppError('NOT_FOUND', 'Enrollment not found', 404);
  }

  // Soft delete by deactivating
  await prisma.kickboxingEnrollment.update({
    where: { id },
    data: { isActive: false },
  });

  await auditLog({
    action: 'KICKBOXING_ENROLLMENT_REMOVED',
    actorId,
    subjectType: 'KickboxingEnrollment',
    subjectId: id,
    oldValue: {
      classId: enrollment.classId,
      clientType: enrollment.clientType,
      clientProfileId: enrollment.clientProfileId,
      externalName: enrollment.externalName,
    },
    branchId,
  });

  return { success: true };
}
