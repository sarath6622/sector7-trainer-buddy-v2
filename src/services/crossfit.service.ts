import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import type { KickboxingClientType, Prisma } from '@prisma/client';

// ─── Shared include helpers ──────────────────────────────────────────────────

const classWithTrainers = {
  trainers: {
    include: {
      trainer: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  },
  _count: { select: { enrollments: { where: { isActive: true } } } },
} satisfies Prisma.CrossfitClassInclude;

// ─── Class CRUD ─────────────────────────────────────────────────────────────

interface CreateClassInput {
  branchId: string;
  trainerProfileIds: string[];
  name: string;
  dayOfWeek: string;
  startTime: string;
  durationMin: number;
  maxCapacity: number;
  actorId: string;
}

export async function createCrossfitClass(input: CreateClassInput) {
  const { branchId, actorId, trainerProfileIds, ...data } = input;

  if (!trainerProfileIds.length) {
    throw new AppError('VALIDATION_ERROR', 'At least one trainer is required', 400);
  }

  // Verify all trainers exist in this branch
  const trainers = await prisma.trainerProfile.findMany({
    where: { id: { in: trainerProfileIds }, branchId },
  });
  if (trainers.length !== trainerProfileIds.length) {
    throw new AppError('NOT_FOUND', 'One or more trainers not found in this branch', 404);
  }

  const cfClass = await prisma.crossfitClass.create({
    data: {
      branchId,
      name: data.name,
      dayOfWeek: data.dayOfWeek as Prisma.EnumDayOfWeekFieldUpdateOperationsInput['set'] & string,
      startTime: data.startTime,
      durationMin: data.durationMin,
      maxCapacity: data.maxCapacity,
      trainers: {
        create: trainerProfileIds.map((tid) => ({
          trainerProfileId: tid,
          branchId,
        })),
      },
    },
    include: classWithTrainers,
  });

  await auditLog({
    action: 'CROSSFIT_CLASS_CREATED',
    actorId,
    subjectType: 'CrossfitClass',
    subjectId: cfClass.id,
    newValue: {
      name: cfClass.name,
      dayOfWeek: cfClass.dayOfWeek,
      startTime: cfClass.startTime,
      trainerProfileIds,
    },
    branchId,
  });

  return cfClass;
}

export async function getCrossfitClasses(branchId: string) {
  return prisma.crossfitClass.findMany({
    where: { branchId },
    include: classWithTrainers,
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}

export async function getCrossfitClassesByTrainer(trainerProfileId: string, branchId: string) {
  return prisma.crossfitClass.findMany({
    where: {
      branchId,
      isActive: true,
      trainers: { some: { trainerProfileId } },
    },
    include: {
      trainers: {
        include: {
          trainer: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      },
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });
}

interface UpdateClassInput {
  trainerProfileIds?: string[];
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
  if (input.name !== undefined) updateData.name = input.name;
  if (input.dayOfWeek !== undefined)
    updateData.dayOfWeek =
      input.dayOfWeek as Prisma.EnumDayOfWeekFieldUpdateOperationsInput['set'] & string;
  if (input.startTime !== undefined) updateData.startTime = input.startTime;
  if (input.durationMin !== undefined) updateData.durationMin = input.durationMin;
  if (input.maxCapacity !== undefined) updateData.maxCapacity = input.maxCapacity;
  if (input.isActive !== undefined) updateData.isActive = input.isActive;

  // Replace trainer list if provided
  if (input.trainerProfileIds !== undefined) {
    if (input.trainerProfileIds.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'At least one trainer is required', 400);
    }
    const trainers = await prisma.trainerProfile.findMany({
      where: { id: { in: input.trainerProfileIds }, branchId },
    });
    if (trainers.length !== input.trainerProfileIds.length) {
      throw new AppError('NOT_FOUND', 'One or more trainers not found in this branch', 404);
    }
    // Delete existing and recreate
    updateData.trainers = {
      deleteMany: {},
      create: input.trainerProfileIds.map((tid) => ({
        trainerProfileId: tid,
        branchId,
      })),
    };
  }

  const updated = await prisma.crossfitClass.update({
    where: { id },
    data: updateData,
    include: classWithTrainers,
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

// ─── Enrollment CRUD ────────────────────────────────────────────────────────

interface CreateEnrollmentInput {
  branchId: string;
  clientProfileId?: string;
  clientType: KickboxingClientType;
  externalName?: string;
  externalPhone?: string;
  actorId: string;
}

export async function createCrossfitEnrollment(input: CreateEnrollmentInput) {
  const { branchId, actorId, ...data } = input;

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
      where: { branchId, clientProfileId: data.clientProfileId, isActive: true },
    });
    if (existing) {
      throw new AppError('DUPLICATE', 'Client is already enrolled in CrossFit', 409);
    }
  } else {
    // GYM_ONLY and EXTERNAL_ONLY both require a name
    if (!data.externalName) {
      throw new AppError('VALIDATION_ERROR', 'Name is required', 400);
    }
  }

  const enrollment = await prisma.crossfitEnrollment.create({
    data: {
      branchId,
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
  clientType?: KickboxingClientType;
}

export async function getCrossfitEnrollments(input: ListEnrollmentsInput) {
  const { branchId, clientType } = input;
  return prisma.crossfitEnrollment.findMany({
    where: {
      branchId,
      isActive: true,
      ...(clientType ? { clientType } : {}),
    },
    include: {
      client: {
        include: { user: { select: { firstName: true, lastName: true, email: true } } },
      },
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
      clientType: enrollment.clientType,
      clientProfileId: enrollment.clientProfileId,
      externalName: enrollment.externalName,
    },
    branchId,
  });

  return { success: true };
}

// ─── Session Management ─────────────────────────────────────────────────────

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

export async function startCrossfitSession(sessionId: string, branchId: string, actorId: string) {
  const session = await prisma.crossfitSession.findFirst({ where: { id: sessionId, branchId } });
  if (!session) {
    throw new AppError('NOT_FOUND', 'CrossFit session not found', 404);
  }
  if (session.status === 'IN_PROGRESS') {
    return session; // idempotent
  }
  if (session.status === 'COMPLETED') {
    throw new AppError('CONFLICT', 'Session is already completed', 409);
  }

  const updated = await prisma.crossfitSession.update({
    where: { id: sessionId },
    data: {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
      startedByUserId: actorId,
    },
    include: { _count: { select: { attendances: true } } },
  });

  await auditLog({
    action: 'CROSSFIT_SESSION_STARTED',
    actorId,
    subjectType: 'CrossfitSession',
    subjectId: sessionId,
    newValue: { status: 'IN_PROGRESS', startedAt: updated.startedAt },
    branchId,
  });

  return updated;
}

export async function endCrossfitSession(sessionId: string, branchId: string, actorId: string) {
  const session = await prisma.crossfitSession.findFirst({ where: { id: sessionId, branchId } });
  if (!session) {
    throw new AppError('NOT_FOUND', 'CrossFit session not found', 404);
  }
  if (session.status === 'COMPLETED') {
    return session; // idempotent
  }
  if (session.status === 'SCHEDULED') {
    throw new AppError('CONFLICT', 'Session has not been started yet', 409);
  }

  const updated = await prisma.crossfitSession.update({
    where: { id: sessionId },
    data: {
      status: 'COMPLETED',
      endedAt: new Date(),
    },
    include: { _count: { select: { attendances: true } } },
  });

  await auditLog({
    action: 'CROSSFIT_SESSION_ENDED',
    actorId,
    subjectType: 'CrossfitSession',
    subjectId: sessionId,
    newValue: { status: 'COMPLETED', endedAt: updated.endedAt },
    branchId,
  });

  return updated;
}

export async function getTodayCrossfitSessionsForTrainer(
  trainerProfileId: string,
  branchId: string,
) {
  const today = new Date();
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  const todayDayOfWeek = days[today.getDay()]!;

  const normalizedToday = new Date(today);
  normalizedToday.setUTCHours(0, 0, 0, 0);

  // Get active classes assigned to this trainer for today's day
  const classes = await prisma.crossfitClass.findMany({
    where: {
      branchId,
      isActive: true,
      dayOfWeek: todayDayOfWeek as Prisma.EnumDayOfWeekFilter['equals'],
      trainers: { some: { trainerProfileId } },
    },
    include: {
      trainers: {
        include: {
          trainer: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      },
      _count: { select: { enrollments: { where: { isActive: true } } } },
    },
    orderBy: { startTime: 'asc' },
  });

  if (classes.length === 0) return [];

  // Fetch existing sessions for today (if any)
  const classIds = classes.map((c) => c.id);
  const sessions = await prisma.crossfitSession.findMany({
    where: {
      branchId,
      classId: { in: classIds },
      date: normalizedToday,
    },
    include: { _count: { select: { attendances: true } } },
  });

  const sessionByClassId = new Map(sessions.map((s) => [s.classId, s]));

  return classes.map((cls) => ({
    class: cls,
    session: sessionByClassId.get(cls.id) ?? null,
  }));
}

// ─── Attendance ─────────────────────────────────────────────────────────────

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

// ─── Admin Attendance List ───────────────────────────────────────────────────

interface AttendanceListInput {
  branchId: string;
  dateFrom: string; // YYYY-MM-DD inclusive
  dateTo: string; // YYYY-MM-DD inclusive
  classId?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export async function getCrossfitAttendanceList(input: AttendanceListInput) {
  const { branchId, dateFrom, dateTo, classId, search, page, pageSize } = input;

  // Build session date range as Date objects (CrossfitSession.date is a Date)
  const start = new Date(`${dateFrom}T00:00:00.000Z`);
  const end = new Date(`${dateTo}T23:59:59.999Z`);

  const search_ = search?.trim();
  const where: Prisma.CrossfitAttendanceWhereInput = {
    branchId,
    session: {
      date: { gte: start, lte: end },
      ...(classId ? { classId } : {}),
    },
    ...(search_
      ? {
          OR: [
            {
              client: {
                user: {
                  OR: [
                    { firstName: { contains: search_, mode: 'insensitive' } },
                    { lastName: { contains: search_, mode: 'insensitive' } },
                  ],
                },
              },
            },
            { externalName: { contains: search_, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.crossfitAttendance.count({ where }),
    prisma.crossfitAttendance.findMany({
      where,
      include: {
        session: {
          include: {
            class: { select: { id: true, name: true, startTime: true } },
          },
        },
        client: {
          include: {
            user: { select: { firstName: true, lastName: true, profileImageUrl: true } },
          },
        },
      },
      orderBy: [{ session: { date: 'desc' } }, { markedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  // Resolve marker names in a single side query — CrossfitAttendance.markedByUserId
  // has no Prisma relation, so we batch-fetch the users we need.
  const markerIds = Array.from(new Set(rows.map((r) => r.markedByUserId)));
  const markers = markerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: markerIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const markerById = new Map(markers.map((m) => [m.id, `${m.firstName} ${m.lastName}`]));

  return {
    data: rows.map((r) => ({
      id: r.id,
      date: r.session.date.toISOString().slice(0, 10), // YYYY-MM-DD
      class: r.session.class,
      member: {
        type: r.clientProfileId ? ('GYM_MEMBER' as const) : ('EXTERNAL' as const),
        name: r.client
          ? `${r.client.user.firstName} ${r.client.user.lastName}`
          : (r.externalName ?? 'Walk-in'),
        profileImageUrl: r.client?.user.profileImageUrl ?? null,
      },
      markedAt: r.markedAt.toISOString(),
      markedByName: markerById.get(r.markedByUserId) ?? 'Unknown',
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

// ─── Client Search ───────────────────────────────────────────────────────────

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

// ─── Enrolled member list for a class ───────────────────────────────────────

export async function getEnrolledClientsForClass(_classId: string, branchId: string) {
  // Enrollment is program-wide (monthly), not per-class — return all active enrollees for the branch
  const enrollments = await prisma.crossfitEnrollment.findMany({
    where: { branchId, isActive: true },
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
