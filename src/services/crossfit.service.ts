import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import type { KickboxingClientType, Prisma } from '@prisma/client';

// ─── Class CRUD ─────────────────────────────────────

interface CreateClassInput {
  branchId: string;
  trainerProfileId: string;
  name: string;
  dayOfWeek: string;
  startTime: string;
  durationMin: number;
  maxCapacity: number;
  actorId: string;
}

export async function createCrossfitClass(input: CreateClassInput) {
  const { branchId, actorId, ...data } = input;

  const trainer = await prisma.trainerProfile.findFirst({
    where: { id: data.trainerProfileId, branchId },
  });
  if (!trainer) {
    throw new AppError('NOT_FOUND', 'Trainer not found', 404);
  }

  const cfClass = await prisma.crossfitClass.create({
    data: {
      branchId,
      trainerProfileId: data.trainerProfileId,
      name: data.name,
      dayOfWeek: data.dayOfWeek as Prisma.EnumDayOfWeekFieldUpdateOperationsInput['set'] & string,
      startTime: data.startTime,
      durationMin: data.durationMin,
      maxCapacity: data.maxCapacity,
    },
    include: {
      trainer: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
  });

  await auditLog({
    action: 'CROSSFIT_CLASS_CREATED',
    actorId,
    subjectType: 'CrossfitClass',
    subjectId: cfClass.id,
    newValue: { name: cfClass.name, dayOfWeek: cfClass.dayOfWeek, startTime: cfClass.startTime },
    branchId,
  });

  return cfClass;
}

export async function getCrossfitClasses(branchId: string) {
  return prisma.crossfitClass.findMany({
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

export async function getCrossfitClassesByTrainer(trainerProfileId: string, branchId: string) {
  return prisma.crossfitClass.findMany({
    where: { trainerProfileId, branchId, isActive: true },
    include: {
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}

interface UpdateClassInput {
  trainerProfileId?: string;
  name?: string;
  dayOfWeek?: string;
  startTime?: string;
  durationMin?: number;
  maxCapacity?: number;
  isActive?: boolean;
}

export async function updateCrossfitClass(
  id: string,
  input: UpdateClassInput,
  branchId: string,
  actorId: string,
) {
  const existing = await prisma.crossfitClass.findFirst({ where: { id, branchId } });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'CrossFit class not found', 404);
  }

  const updateData: Prisma.CrossfitClassUpdateInput = {};
  if (input.trainerProfileId !== undefined)
    updateData.trainer = { connect: { id: input.trainerProfileId } };
  if (input.name !== undefined) updateData.name = input.name;
  if (input.dayOfWeek !== undefined)
    updateData.dayOfWeek =
      input.dayOfWeek as Prisma.EnumDayOfWeekFieldUpdateOperationsInput['set'] & string;
  if (input.startTime !== undefined) updateData.startTime = input.startTime;
  if (input.durationMin !== undefined) updateData.durationMin = input.durationMin;
  if (input.maxCapacity !== undefined) updateData.maxCapacity = input.maxCapacity;
  if (input.isActive !== undefined) updateData.isActive = input.isActive;

  const updated = await prisma.crossfitClass.update({
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
    action: 'CROSSFIT_CLASS_UPDATED',
    actorId,
    subjectType: 'CrossfitClass',
    subjectId: id,
    oldValue: { name: existing.name, dayOfWeek: existing.dayOfWeek, isActive: existing.isActive },
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

export async function createCrossfitEnrollment(input: CreateEnrollmentInput) {
  const { branchId, actorId, ...data } = input;

  const cfClass = await prisma.crossfitClass.findFirst({
    where: { id: data.classId, branchId, isActive: true },
    include: { _count: { select: { enrollments: { where: { isActive: true } } } } },
  });
  if (!cfClass) {
    throw new AppError('NOT_FOUND', 'CrossFit class not found', 404);
  }
  if (cfClass._count.enrollments >= cfClass.maxCapacity) {
    throw new AppError('CAPACITY_FULL', 'Class has reached maximum capacity', 400);
  }

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
    const existing = await prisma.crossfitEnrollment.findFirst({
      where: { classId: data.classId, clientProfileId: data.clientProfileId, isActive: true },
    });
    if (existing) {
      throw new AppError('DUPLICATE', 'Client is already enrolled in this class', 409);
    }
  } else {
    if (!data.externalName) {
      throw new AppError('VALIDATION_ERROR', 'externalName is required for EXTERNAL_ONLY', 400);
    }
  }

  const enrollment = await prisma.crossfitEnrollment.create({
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
    action: 'CROSSFIT_ENROLLMENT_CREATED',
    actorId,
    subjectType: 'CrossfitEnrollment',
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

export async function getCrossfitEnrollments(input: ListEnrollmentsInput) {
  const { branchId, classId, clientType } = input;
  return prisma.crossfitEnrollment.findMany({
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
      class: { select: { name: true, dayOfWeek: true, startTime: true, durationMin: true } },
    },
    orderBy: { enrolledAt: 'desc' },
  });
}

export async function deleteCrossfitEnrollment(id: string, branchId: string, actorId: string) {
  const enrollment = await prisma.crossfitEnrollment.findFirst({ where: { id, branchId } });
  if (!enrollment) {
    throw new AppError('NOT_FOUND', 'Enrollment not found', 404);
  }

  await prisma.crossfitEnrollment.update({ where: { id }, data: { isActive: false } });

  await auditLog({
    action: 'CROSSFIT_ENROLLMENT_REMOVED',
    actorId,
    subjectType: 'CrossfitEnrollment',
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

// ─── Session Management ─────────────────────────────

export async function getOrCreateCrossfitSession(
  classId: string,
  date: Date,
  branchId: string,
  actorId: string,
) {
  const cfClass = await prisma.crossfitClass.findFirst({
    where: { id: classId, branchId, isActive: true },
  });
  if (!cfClass) {
    throw new AppError('NOT_FOUND', 'CrossFit class not found', 404);
  }

  // Normalize date to midnight UTC to avoid time-zone duplicates
  const normalizedDate = new Date(date);
  normalizedDate.setUTCHours(0, 0, 0, 0);

  const existing = await prisma.crossfitSession.findUnique({
    where: { classId_date: { classId, date: normalizedDate } },
    include: { _count: { select: { attendances: true } } },
  });
  if (existing) return existing;

  const session = await prisma.crossfitSession.create({
    data: { branchId, classId, date: normalizedDate },
    include: { _count: { select: { attendances: true } } },
  });

  await auditLog({
    action: 'CROSSFIT_SESSION_OPENED',
    actorId,
    subjectType: 'CrossfitSession',
    subjectId: session.id,
    newValue: { classId, date: normalizedDate },
    branchId,
  });

  return session;
}

// ─── Attendance ─────────────────────────────────────

interface MarkAttendanceInput {
  clientProfileId?: string;
  externalName?: string;
}

export async function markCrossfitAttendance(
  sessionId: string,
  input: MarkAttendanceInput,
  markedByUserId: string,
  branchId: string,
) {
  const session = await prisma.crossfitSession.findFirst({ where: { id: sessionId, branchId } });
  if (!session) {
    throw new AppError('NOT_FOUND', 'CrossFit session not found', 404);
  }

  if (!input.clientProfileId && !input.externalName) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Either clientProfileId or externalName is required',
      400,
    );
  }

  if (input.clientProfileId) {
    const client = await prisma.clientProfile.findFirst({
      where: { id: input.clientProfileId, branchId },
    });
    if (!client) {
      throw new AppError('NOT_FOUND', 'Client not found', 404);
    }

    const duplicate = await prisma.crossfitAttendance.findUnique({
      where: {
        sessionId_clientProfileId: {
          sessionId,
          clientProfileId: input.clientProfileId,
        },
      },
    });
    if (duplicate) {
      throw new AppError('DUPLICATE', 'Client is already marked present for this session', 409);
    }
  }

  const attendance = await prisma.crossfitAttendance.create({
    data: {
      branchId,
      sessionId,
      clientProfileId: input.clientProfileId ?? null,
      externalName: input.externalName,
      markedByUserId,
    },
    include: {
      client: {
        include: {
          user: { select: { firstName: true, lastName: true, profileImageUrl: true } },
        },
      },
    },
  });

  await auditLog({
    action: 'CROSSFIT_ATTENDANCE_MARKED',
    actorId: markedByUserId,
    subjectType: 'CrossfitAttendance',
    subjectId: attendance.id,
    newValue: {
      sessionId,
      clientProfileId: input.clientProfileId,
      externalName: input.externalName,
    },
    branchId,
  });

  return attendance;
}

export async function removeCrossfitAttendance(
  sessionId: string,
  attendanceId: string,
  branchId: string,
  actorId: string,
) {
  const attendance = await prisma.crossfitAttendance.findFirst({
    where: { id: attendanceId, sessionId, branchId },
  });
  if (!attendance) {
    throw new AppError('NOT_FOUND', 'Attendance record not found', 404);
  }

  await prisma.crossfitAttendance.delete({ where: { id: attendanceId } });

  await auditLog({
    action: 'CROSSFIT_ATTENDANCE_REMOVED',
    actorId,
    subjectType: 'CrossfitAttendance',
    subjectId: attendanceId,
    oldValue: {
      sessionId,
      clientProfileId: attendance.clientProfileId,
      externalName: attendance.externalName,
    },
    branchId,
  });

  return { success: true };
}

export async function getCrossfitAttendance(sessionId: string, branchId: string) {
  const session = await prisma.crossfitSession.findFirst({ where: { id: sessionId, branchId } });
  if (!session) {
    throw new AppError('NOT_FOUND', 'CrossFit session not found', 404);
  }

  return prisma.crossfitAttendance.findMany({
    where: { sessionId },
    include: {
      client: {
        include: {
          user: { select: { firstName: true, lastName: true, profileImageUrl: true } },
        },
      },
    },
    orderBy: { markedAt: 'asc' },
  });
}

// ─── Client Search ───────────────────────────────────

export async function searchCrossfitClients(query: string, branchId: string, classId?: string) {
  if (query.length < 2) return [];

  const clients = await prisma.clientProfile.findMany({
    where: {
      branchId,
      user: {
        isActive: true,
        deletedAt: null,
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
        ],
      },
    },
    include: {
      user: { select: { firstName: true, lastName: true, profileImageUrl: true } },
    },
    take: 20,
  });

  // If classId provided, mark which results are enrolled
  let enrolledIds = new Set<string>();
  if (classId) {
    const enrollments = await prisma.crossfitEnrollment.findMany({
      where: { classId, isActive: true, clientProfileId: { in: clients.map((c) => c.id) } },
      select: { clientProfileId: true },
    });
    enrolledIds = new Set(enrollments.map((e) => e.clientProfileId).filter(Boolean) as string[]);
  }

  return clients.map((c) => ({
    id: c.id,
    name: `${c.user.firstName} ${c.user.lastName}`,
    profileImageUrl: c.user.profileImageUrl,
    isEnrolled: enrolledIds.has(c.id),
  }));
}
