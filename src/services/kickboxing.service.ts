import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import type { KickboxingClientType, Prisma } from '@prisma/client';

// ─── Shared include helpers ──────────────────────────────────────────────────

const classWithTrainer = {
  trainer: {
    include: { user: { select: { firstName: true, lastName: true } } },
  },
  _count: { select: { enrollments: { where: { isActive: true } } } },
} satisfies Prisma.KickboxingClassInclude;

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

export async function createKickboxingClass(input: CreateClassInput) {
  const { branchId, actorId, ...data } = input;

  const trainer = await prisma.trainerProfile.findFirst({
    where: { id: data.trainerProfileId, branchId },
  });

  if (!trainer) {
    throw new AppError('NOT_FOUND', 'Trainer not found', 404);
  }

  const kbClass = await prisma.kickboxingClass.create({
    data: {
      branchId,
      trainerProfileId: data.trainerProfileId,
      name: data.name,
      dayOfWeek: data.dayOfWeek as Prisma.EnumDayOfWeekFieldUpdateOperationsInput['set'] & string,
      startTime: data.startTime,
      durationMin: data.durationMin,
      maxCapacity: data.maxCapacity,
    },
    include: classWithTrainer,
  });

  await auditLog({
    action: 'KICKBOXING_CLASS_CREATED',
    actorId,
    subjectType: 'KickboxingClass',
    subjectId: kbClass.id,
    newValue: {
      name: kbClass.name,
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
    include: classWithTrainer,
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}

export async function getKickboxingClassesByTrainer(trainerProfileId: string, branchId: string) {
  return prisma.kickboxingClass.findMany({
    where: { branchId, isActive: true, trainerProfileId },
    include: classWithTrainer,
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

export async function updateKickboxingClass(
  id: string,
  input: UpdateClassInput,
  branchId: string,
  actorId: string,
) {
  const existing = await prisma.kickboxingClass.findFirst({ where: { id, branchId } });

  if (!existing) {
    throw new AppError('NOT_FOUND', 'Kickboxing class not found', 404);
  }

  const updateData: Prisma.KickboxingClassUpdateInput = {};
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

  const updated = await prisma.kickboxingClass.update({
    where: { id },
    data: updateData,
    include: classWithTrainer,
  });

  await auditLog({
    action: 'KICKBOXING_CLASS_UPDATED',
    actorId,
    subjectType: 'KickboxingClass',
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

// ─── Session Management ──────────────────────────────────────────────────────

export async function getOrCreateKickboxingSession(
  classId: string,
  date: Date,
  branchId: string,
  actorId: string,
) {
  const kbClass = await prisma.kickboxingClass.findFirst({
    where: { id: classId, branchId, isActive: true },
  });
  if (!kbClass) {
    throw new AppError('NOT_FOUND', 'Kickboxing class not found', 404);
  }

  // Normalize to midnight UTC to avoid time-zone duplicates
  const normalizedDate = new Date(date);
  normalizedDate.setUTCHours(0, 0, 0, 0);

  const existing = await prisma.kickboxingSession.findUnique({
    where: { classId_date: { classId, date: normalizedDate } },
    include: { _count: { select: { attendances: true } } },
  });
  if (existing) return existing;

  const session = await prisma.kickboxingSession.create({
    data: { branchId, classId, date: normalizedDate },
    include: { _count: { select: { attendances: true } } },
  });

  await auditLog({
    action: 'KICKBOXING_SESSION_OPENED',
    actorId,
    subjectType: 'KickboxingSession',
    subjectId: session.id,
    newValue: { classId, date: normalizedDate },
    branchId,
  });

  return session;
}

export async function startKickboxingSession(sessionId: string, branchId: string, actorId: string) {
  const session = await prisma.kickboxingSession.findFirst({ where: { id: sessionId, branchId } });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Kickboxing session not found', 404);
  }
  if (session.status === 'IN_PROGRESS') {
    return session; // idempotent
  }
  if (session.status === 'COMPLETED') {
    throw new AppError('CONFLICT', 'Session is already completed', 409);
  }

  const updated = await prisma.kickboxingSession.update({
    where: { id: sessionId },
    data: { status: 'IN_PROGRESS', startedAt: new Date(), startedByUserId: actorId },
    include: { _count: { select: { attendances: true } } },
  });

  await auditLog({
    action: 'KICKBOXING_SESSION_STARTED',
    actorId,
    subjectType: 'KickboxingSession',
    subjectId: sessionId,
    newValue: { status: 'IN_PROGRESS', startedAt: updated.startedAt },
    branchId,
  });

  return updated;
}

export async function endKickboxingSession(sessionId: string, branchId: string, actorId: string) {
  const session = await prisma.kickboxingSession.findFirst({ where: { id: sessionId, branchId } });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Kickboxing session not found', 404);
  }
  if (session.status === 'COMPLETED') {
    return session; // idempotent
  }
  if (session.status === 'SCHEDULED') {
    throw new AppError('CONFLICT', 'Session has not been started yet', 409);
  }

  const updated = await prisma.kickboxingSession.update({
    where: { id: sessionId },
    data: { status: 'COMPLETED', endedAt: new Date() },
    include: { _count: { select: { attendances: true } } },
  });

  await auditLog({
    action: 'KICKBOXING_SESSION_ENDED',
    actorId,
    subjectType: 'KickboxingSession',
    subjectId: sessionId,
    newValue: { status: 'COMPLETED', endedAt: updated.endedAt },
    branchId,
  });

  return updated;
}

export async function getTodayKickboxingSessionsForTrainer(
  trainerProfileId: string,
  branchId: string,
) {
  const today = new Date();
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const todayDayOfWeek = days[today.getDay()]!;

  const normalizedToday = new Date(today);
  normalizedToday.setUTCHours(0, 0, 0, 0);

  const classes = await prisma.kickboxingClass.findMany({
    where: {
      branchId,
      isActive: true,
      dayOfWeek: todayDayOfWeek as Prisma.EnumDayOfWeekFilter['equals'],
      trainerProfileId,
    },
    include: classWithTrainer,
    orderBy: { startTime: 'asc' },
  });

  if (classes.length === 0) return [];

  const classIds = classes.map((c) => c.id);
  const sessions = await prisma.kickboxingSession.findMany({
    where: { branchId, classId: { in: classIds }, date: normalizedToday },
    include: { _count: { select: { attendances: true } } },
  });

  const sessionByClassId = new Map(sessions.map((s) => [s.classId, s]));

  return classes.map((cls) => ({
    class: cls,
    session: sessionByClassId.get(cls.id) ?? null,
  }));
}

// ─── Attendance ──────────────────────────────────────────────────────────────

interface MarkAttendanceInput {
  clientProfileId?: string;
  externalName?: string;
}

export async function markKickboxingAttendance(
  sessionId: string,
  input: MarkAttendanceInput,
  markedByUserId: string,
  branchId: string,
) {
  const session = await prisma.kickboxingSession.findFirst({ where: { id: sessionId, branchId } });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Kickboxing session not found', 404);
  }
  if (session.status === 'COMPLETED') {
    throw new AppError('CONFLICT', 'Session is already completed — attendance is locked', 409);
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

    const duplicate = await prisma.kickboxingAttendance.findUnique({
      where: { sessionId_clientProfileId: { sessionId, clientProfileId: input.clientProfileId } },
    });
    if (duplicate) {
      throw new AppError('DUPLICATE', 'Client is already marked present for this session', 409);
    }
  }

  const attendance = await prisma.kickboxingAttendance.create({
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
    action: 'KICKBOXING_ATTENDANCE_MARKED',
    actorId: markedByUserId,
    subjectType: 'KickboxingAttendance',
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

export async function removeKickboxingAttendance(
  sessionId: string,
  attendanceId: string,
  branchId: string,
  actorId: string,
) {
  const attendance = await prisma.kickboxingAttendance.findFirst({
    where: { id: attendanceId, sessionId, branchId },
  });
  if (!attendance) {
    throw new AppError('NOT_FOUND', 'Attendance record not found', 404);
  }

  await prisma.kickboxingAttendance.delete({ where: { id: attendanceId } });

  await auditLog({
    action: 'KICKBOXING_ATTENDANCE_REMOVED',
    actorId,
    subjectType: 'KickboxingAttendance',
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

export async function getKickboxingAttendance(sessionId: string, branchId: string) {
  const session = await prisma.kickboxingSession.findFirst({ where: { id: sessionId, branchId } });
  if (!session) {
    throw new AppError('NOT_FOUND', 'Kickboxing session not found', 404);
  }

  return prisma.kickboxingAttendance.findMany({
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

// ─── Enrolled members for a class ────────────────────────────────────────────

export async function getEnrolledClientsForKickboxingClass(classId: string, branchId: string) {
  // Kickboxing enrollment is per-class (unlike CrossFit which is program-wide)
  const enrollments = await prisma.kickboxingEnrollment.findMany({
    where: { classId, branchId, isActive: true },
    include: {
      client: {
        include: {
          user: { select: { firstName: true, lastName: true, profileImageUrl: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return enrollments.map((e) => ({
    enrollmentId: e.id,
    clientProfileId: e.client?.id ?? null,
    externalName: e.externalName ?? null,
    name: e.client
      ? `${e.client.user.firstName} ${e.client.user.lastName}`
      : (e.externalName ?? 'Unknown'),
    profileImageUrl: e.client?.user.profileImageUrl ?? null,
    clientType: e.clientType,
  }));
}

// ─── Client Search ────────────────────────────────────────────────────────────

export async function searchKickboxingClients(query: string, branchId: string, classId?: string) {
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

  // If classId provided, mark which results are already enrolled in that class
  let enrolledIds = new Set<string>();
  if (classId) {
    const enrollments = await prisma.kickboxingEnrollment.findMany({
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
