import { hash } from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import type { Prisma, UserRole, DayOfWeek } from '@prisma/client';

interface ShiftInput {
  label: string;
  startTime: string;
  endTime: string;
  days: string[];
}

function deriveWorkingDays(shifts: ShiftInput[]): DayOfWeek[] {
  const days = new Set<string>();
  for (const shift of shifts) {
    for (const day of shift.days) days.add(day);
  }
  return Array.from(days) as DayOfWeek[];
}

interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  roles: UserRole[];
  branchId: string;
  actorId: string;
  // Trainer fields
  specialties?: string[];
  certifications?: string[];
  bio?: string;
  shifts?: ShiftInput[];
  // Client fields
  gender?: string;
  dateOfBirth?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  height?: number;
  currentWeight?: number;
  bodyFatPercentage?: number;
  medicalConditions?: string;
  fitnessGoals?: string;
  sessionDurationOverrideMin?: number;
}

interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  roles?: UserRole[];
  // Trainer fields
  specialties?: string[];
  certifications?: string[];
  bio?: string;
  shifts?: ShiftInput[];
  // Client fields
  gender?: string;
  dateOfBirth?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  height?: number;
  currentWeight?: number;
  bodyFatPercentage?: number;
  medicalConditions?: string;
  fitnessGoals?: string;
  sessionDurationOverrideMin?: number;
}

type AttentionFilter = 'expiring_soon' | 'expired' | 'low_sessions' | 'used_up';

interface ListUsersInput {
  branchId: string;
  role?: UserRole;
  page: number;
  pageSize: number;
  search?: string;
  status?: 'all' | 'active' | 'inactive';
  attention?: AttentionFilter;
  /** trainerProfileId, or the reserved literal 'unassigned'. */
  trainerId?: string;
}

// How many days out counts as "expiring soon" for the renewal filter.
const EXPIRING_SOON_DAYS = 30;

/**
 * Resolves the set of clientProfileIds whose active package falls into a
 * sessions-based renewal bucket. These can't be expressed as a Prisma `where`
 * because "sessions left" = totalSessions − (onboarding + COMPLETED/NO_SHOW in
 * the package window), so we compute it here and feed the IDs back into the
 * main paginated query (keeping DB-level pagination + an accurate total).
 *
 * Thresholds mirror the client list card exactly so the filter and the badge
 * never disagree: red/low = `0 < left ≤ ceil(sessionsPerMonth/30 · 7)`,
 * used-up = `left === 0`.
 */
async function getClientIdsBySessionBucket(
  branchId: string,
  bucket: 'low_sessions' | 'used_up',
): Promise<string[]> {
  const packages = await prisma.ptPackage.findMany({
    where: { branchId, isActive: true },
    select: {
      clientProfileId: true,
      startDate: true,
      endDate: true,
      totalSessions: true,
      onboardingUsedSessions: true,
      sessionsPerMonth: true,
    },
  });
  if (packages.length === 0) return [];

  const minStart = new Date(Math.min(...packages.map((p) => p.startDate.getTime())));
  const maxEnd = new Date(
    Math.max(
      ...packages.map((p) =>
        (p.endDate ?? new Date(p.startDate.getTime() + 30 * 86_400_000)).getTime(),
      ),
    ),
  );

  const sessions = await prisma.sessionInstance.findMany({
    where: {
      branchId,
      status: { in: ['COMPLETED', 'NO_SHOW'] },
      scheduledDate: { gte: minStart, lte: maxEnd },
    },
    select: { clientProfileId: true, scheduledDate: true },
  });

  const ids = new Set<string>();
  for (const pkg of packages) {
    if (pkg.totalSessions <= 0) continue;
    const windowEnd = pkg.endDate ?? new Date(pkg.startDate.getTime() + 30 * 86_400_000);
    const used =
      pkg.onboardingUsedSessions +
      sessions.filter(
        (s) =>
          s.clientProfileId === pkg.clientProfileId &&
          s.scheduledDate >= pkg.startDate &&
          s.scheduledDate <= windowEnd,
      ).length;
    const left = Math.max(0, pkg.totalSessions - used);
    const redThreshold = Math.max(1, Math.ceil((pkg.sessionsPerMonth / 30) * 7));
    const matches = bucket === 'used_up' ? left === 0 : left > 0 && left <= redThreshold;
    if (matches) ids.add(pkg.clientProfileId);
  }
  return Array.from(ids);
}

export async function createUser(input: CreateUserInput) {
  const { branchId, actorId, password, roles, ...userData } = input;

  // Check for duplicate email
  const existing = await prisma.user.findUnique({ where: { email: userData.email } });
  if (existing) {
    throw new AppError('DUPLICATE_EMAIL', 'A user with this email already exists', 409);
  }

  const passwordHash = await hash(password, 12);

  const user = await prisma.user.create({
    data: {
      branchId,
      email: userData.email,
      passwordHash,
      firstName: userData.firstName,
      lastName: userData.lastName,
      phone: userData.phone,
      roles,
    },
  });

  // Create role-specific profile if user has a trainer role
  const isTrainer =
    roles.includes('TRAINER') ||
    roles.includes('KICKBOXING_TRAINER') ||
    roles.includes('CROSSFIT_TRAINER');

  if (isTrainer) {
    const trainerProfile = await prisma.trainerProfile.create({
      data: {
        userId: user.id,
        branchId,
        specialties: userData.specialties ?? [],
        certifications: userData.certifications ?? [],
        bio: userData.bio,
        workingDays: deriveWorkingDays(
          userData.shifts ?? [],
        ) as Prisma.TrainerProfileCreateInput['workingDays'],
      },
    });

    if (userData.shifts && userData.shifts.length > 0) {
      await prisma.trainerShift.createMany({
        data: userData.shifts.map((s) => ({
          branchId,
          trainerProfileId: trainerProfile.id,
          label: s.label,
          startTime: s.startTime,
          endTime: s.endTime,
          days: s.days as DayOfWeek[],
        })),
      });
    }
  } else if (roles.includes('CLIENT')) {
    await prisma.clientProfile.create({
      data: {
        userId: user.id,
        branchId,
        gender: userData.gender as 'MALE' | 'FEMALE' | undefined,
        dateOfBirth: userData.dateOfBirth ? new Date(userData.dateOfBirth) : undefined,
        emergencyContactName: userData.emergencyContactName,
        emergencyContactPhone: userData.emergencyContactPhone,
        height: userData.height,
        currentWeight: userData.currentWeight,
        bodyFatPercentage: userData.bodyFatPercentage,
        medicalConditions: userData.medicalConditions,
        fitnessGoals: userData.fitnessGoals,
        sessionDurationOverrideMin: userData.sessionDurationOverrideMin,
      },
    });
  }

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      trainerProfile: true,
      clientProfile: true,
    },
  });

  await auditLog({
    action: 'USER_CREATED',
    actorId,
    subjectType: 'User',
    subjectId: user.id,
    newValue: {
      email: user.email,
      roles: user.roles,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    branchId,
  });

  return fullUser;
}

export async function getUsers(input: ListUsersInput) {
  const { branchId, role, page, pageSize, search, status, attention, trainerId } = input;

  // Base scope (branch + role) — used for the stable "active" tally that the
  // header shows regardless of the current search/status filter.
  const baseWhere: Prisma.UserWhereInput = {
    branchId,
    deletedAt: null,
    ...(role ? { roles: { hasSome: [role] } } : {}),
  };

  // Multi-term search: every whitespace-separated term must match at least one
  // of name / email / phone (case-insensitive). This makes "asha sujith" match
  // a first+last name split across columns, while single terms ("as", a phone
  // fragment, part of an email) still work. Order-independent.
  const terms = search?.split(/\s+/).filter(Boolean) ?? [];
  const searchWhere: Prisma.UserWhereInput =
    terms.length > 0
      ? {
          AND: terms.map((term) => ({
            OR: [
              { firstName: { contains: term, mode: 'insensitive' as const } },
              { lastName: { contains: term, mode: 'insensitive' as const } },
              { email: { contains: term, mode: 'insensitive' as const } },
              { phone: { contains: term, mode: 'insensitive' as const } },
            ],
          })),
        }
      : {};

  // ── Assignment + renewal ("needs attention") filters ──────────────────
  // All package constraints are ANDed onto a single `some` so they describe the
  // SAME active package row. `unassigned` and `no active package` use `none`.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const expiringHorizon = new Date(startOfToday);
  expiringHorizon.setDate(expiringHorizon.getDate() + EXPIRING_SOON_DAYS);

  const activePkg: Prisma.PtPackageWhereInput = { isActive: true };
  let requireSomeActive = false;
  let requireNoActive = false;

  if (trainerId === 'unassigned') {
    requireNoActive = true;
  } else if (trainerId) {
    activePkg.trainerProfileId = trainerId;
    requireSomeActive = true;
  }

  if (attention === 'expired') {
    activePkg.endDate = { lt: startOfToday };
    requireSomeActive = true;
  } else if (attention === 'expiring_soon') {
    activePkg.endDate = { gte: startOfToday, lte: expiringHorizon };
    requireSomeActive = true;
  }

  // Session-count buckets resolve to a clientProfileId set, then constrain the
  // main query so DB pagination + total stay correct.
  let sessionBucketIds: string[] | null = null;
  if (attention === 'low_sessions' || attention === 'used_up') {
    sessionBucketIds = await getClientIdsBySessionBucket(branchId, attention);
    requireSomeActive = true;
  }

  const clientProfileWhere: Prisma.ClientProfileWhereInput = {};
  if (requireNoActive) {
    clientProfileWhere.ptPackages = { none: { isActive: true } };
  } else if (requireSomeActive) {
    clientProfileWhere.ptPackages = { some: activePkg };
  }
  if (sessionBucketIds !== null) {
    clientProfileWhere.id = { in: sessionBucketIds };
  }

  const where: Prisma.UserWhereInput = {
    ...baseWhere,
    ...(status === 'active'
      ? { isActive: true }
      : status === 'inactive'
        ? { isActive: false }
        : {}),
    ...searchWhere,
    ...(Object.keys(clientProfileWhere).length > 0
      ? { clientProfile: { is: clientProfileWhere } }
      : {}),
  };

  const [users, total, activeCount] = await Promise.all([
    prisma.user.findMany({
      where,
      include: {
        trainerProfile: { include: { shifts: true } },
        clientProfile: {
          include: {
            ptPackages: {
              where: { isActive: true },
              take: 1,
              orderBy: { endDate: 'desc' },
              include: {
                trainer: {
                  include: { user: { select: { firstName: true, lastName: true } } },
                },
              },
            },
          },
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
    prisma.user.count({ where: { ...baseWhere, isActive: true } }),
  ]);

  // Measurement recency — flag client profiles with no body/weight measurement
  // logged within the branch-configured window (default 30 days). Threshold is
  // admin-configurable via BranchSettings → "Measurement Reminder Window".
  const branchSettings = await prisma.branchSettings.findUnique({
    where: { branchId },
    select: { measurementReminderDays: true },
  });
  const measurementReminderDays = branchSettings?.measurementReminderDays ?? 30;
  const measurementStaleBefore = new Date(
    Date.now() - measurementReminderDays * 24 * 60 * 60 * 1000,
  );

  const clientProfileIds = users
    .map((u) => u.clientProfile?.id)
    .filter((id): id is string => Boolean(id));
  const lastMeasurementByClient = new Map<string, Date | null>();
  if (clientProfileIds.length > 0) {
    const latestMeasurements = await prisma.progressEntry.groupBy({
      by: ['clientProfileId'],
      where: { clientProfileId: { in: clientProfileIds } },
      _max: { recordedAt: true },
    });
    for (const m of latestMeasurements) {
      lastMeasurementByClient.set(m.clientProfileId, m._max.recordedAt);
    }
  }

  // Compute sessions-used per active package so the UI can show
  // sessions-based progress (paid-for sessions, not time).
  const activePackages = users.flatMap((u) => u.clientProfile?.ptPackages ?? []);
  const usedByPackageId = new Map<string, number>();

  if (activePackages.length > 0) {
    const clientIds = Array.from(new Set(activePackages.map((p) => p.clientProfileId)));
    const minStart = new Date(Math.min(...activePackages.map((p) => p.startDate.getTime())));
    const maxEnd = new Date(
      Math.max(
        ...activePackages.map((p) =>
          (p.endDate ?? new Date(p.startDate.getTime() + 30 * 86_400_000)).getTime(),
        ),
      ),
    );

    const sessions = await prisma.sessionInstance.findMany({
      where: {
        branchId,
        clientProfileId: { in: clientIds },
        status: { in: ['COMPLETED', 'NO_SHOW'] },
        scheduledDate: { gte: minStart, lte: maxEnd },
      },
      select: { clientProfileId: true, scheduledDate: true },
    });

    for (const pkg of activePackages) {
      const windowEnd = pkg.endDate ?? new Date(pkg.startDate.getTime() + 30 * 86_400_000);
      const counted = sessions.filter(
        (s) =>
          s.clientProfileId === pkg.clientProfileId &&
          s.scheduledDate >= pkg.startDate &&
          s.scheduledDate <= windowEnd,
      ).length;
      usedByPackageId.set(pkg.id, counted + pkg.onboardingUsedSessions);
    }
  }

  const data = users.map((u) => {
    if (!u.clientProfile) return u;
    const lastMeasurementAt = lastMeasurementByClient.get(u.clientProfile.id) ?? null;
    return {
      ...u,
      clientProfile: {
        ...u.clientProfile,
        ptPackages: u.clientProfile.ptPackages.map((pkg) => ({
          ...pkg,
          usedSessions: usedByPackageId.get(pkg.id) ?? pkg.onboardingUsedSessions,
        })),
        lastMeasurementAt: lastMeasurementAt ? lastMeasurementAt.toISOString() : null,
        measurementStale: !lastMeasurementAt || lastMeasurementAt < measurementStaleBefore,
      },
    };
  });

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
    // Stable branch-wide active tally (ignores search/status) so the header
    // can show roster health without flickering as the admin types.
    activeCount,
    // Branch-configured window that drives the "No measurements" badge.
    measurementReminderDays,
  };
}

export async function getUserById(id: string, branchId: string) {
  const user = await prisma.user.findFirst({
    where: { id, branchId, deletedAt: null },
    include: {
      trainerProfile: { include: { shifts: true } },
      clientProfile: true,
    },
  });

  if (!user) {
    throw new AppError('NOT_FOUND', 'User not found', 404);
  }

  return user;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  branchId: string,
  actorId: string,
) {
  const existingUser = await prisma.user.findFirst({
    where: { id, branchId, deletedAt: null },
    include: { trainerProfile: true, clientProfile: true },
  });

  if (!existingUser) {
    throw new AppError('NOT_FOUND', 'User not found', 404);
  }

  const oldValue = {
    firstName: existingUser.firstName,
    lastName: existingUser.lastName,
    phone: existingUser.phone,
    roles: existingUser.roles,
  };

  // Update base user fields
  const userUpdateData: Prisma.UserUpdateInput = {};
  if (input.firstName !== undefined) userUpdateData.firstName = input.firstName;
  if (input.lastName !== undefined) userUpdateData.lastName = input.lastName;
  if (input.phone !== undefined) userUpdateData.phone = input.phone;
  if (input.roles !== undefined) userUpdateData.roles = input.roles;

  if (Object.keys(userUpdateData).length > 0) {
    await prisma.user.update({ where: { id }, data: userUpdateData });
  }

  // Update trainer profile if exists
  if (existingUser.trainerProfile) {
    const trainerProfileId = existingUser.trainerProfile.id;
    const trainerUpdate: Prisma.TrainerProfileUpdateInput = {};
    if (input.specialties !== undefined) trainerUpdate.specialties = input.specialties;
    if (input.certifications !== undefined) trainerUpdate.certifications = input.certifications;
    if (input.bio !== undefined) trainerUpdate.bio = input.bio;

    if (input.shifts !== undefined) {
      // delete-then-recreate pattern (ADR-015) for idempotent shift writes
      await prisma.trainerShift.deleteMany({ where: { trainerProfileId, branchId } });
      if (input.shifts.length > 0) {
        await prisma.trainerShift.createMany({
          data: input.shifts.map((s) => ({
            branchId,
            trainerProfileId,
            label: s.label,
            startTime: s.startTime,
            endTime: s.endTime,
            days: s.days as DayOfWeek[],
          })),
        });
      }
      // keep workingDays in sync as derived union of shift days
      trainerUpdate.workingDays = deriveWorkingDays(
        input.shifts,
      ) as Prisma.TrainerProfileUpdateInput['workingDays'];
    }

    if (Object.keys(trainerUpdate).length > 0) {
      await prisma.trainerProfile.update({
        where: { id: trainerProfileId },
        data: trainerUpdate,
      });
    }
  }

  // Update client profile if exists
  if (existingUser.clientProfile) {
    const clientUpdate: Prisma.ClientProfileUpdateInput = {};
    if (input.gender !== undefined)
      clientUpdate.gender = (input.gender || null) as 'MALE' | 'FEMALE' | null;
    if (input.dateOfBirth !== undefined) clientUpdate.dateOfBirth = new Date(input.dateOfBirth);
    if (input.emergencyContactName !== undefined)
      clientUpdate.emergencyContactName = input.emergencyContactName;
    if (input.emergencyContactPhone !== undefined)
      clientUpdate.emergencyContactPhone = input.emergencyContactPhone;
    if (input.height !== undefined) clientUpdate.height = input.height;
    if (input.currentWeight !== undefined) clientUpdate.currentWeight = input.currentWeight;
    if (input.bodyFatPercentage !== undefined)
      clientUpdate.bodyFatPercentage = input.bodyFatPercentage;
    if (input.medicalConditions !== undefined)
      clientUpdate.medicalConditions = input.medicalConditions;
    if (input.fitnessGoals !== undefined) clientUpdate.fitnessGoals = input.fitnessGoals;
    if (input.sessionDurationOverrideMin !== undefined)
      clientUpdate.sessionDurationOverrideMin = input.sessionDurationOverrideMin;

    if (Object.keys(clientUpdate).length > 0) {
      await prisma.clientProfile.update({
        where: { id: existingUser.clientProfile.id },
        data: clientUpdate,
      });
    }
  }

  const updatedUser = await prisma.user.findUnique({
    where: { id },
    include: { trainerProfile: { include: { shifts: true } }, clientProfile: true },
  });

  await auditLog({
    action: 'USER_UPDATED',
    actorId,
    subjectType: 'User',
    subjectId: id,
    oldValue,
    newValue: {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      roles: input.roles,
    },
    branchId,
  });

  return updatedUser;
}

export async function deleteUser(id: string, branchId: string, actorId: string) {
  const user = await prisma.user.findFirst({
    where: { id, branchId, deletedAt: null },
  });

  if (!user) {
    throw new AppError('NOT_FOUND', 'User not found', 404);
  }

  // Soft delete
  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  await auditLog({
    action: 'USER_DELETED',
    actorId,
    subjectType: 'User',
    subjectId: id,
    oldValue: { email: user.email, roles: user.roles },
    branchId,
  });

  return { success: true };
}

/**
 * Toggle payment status on a client profile (PAID / PENDING).
 */
export async function updatePaymentStatus(
  clientProfileId: string,
  paymentStatus: 'PAID' | 'PENDING',
  branchId: string,
  actorId: string,
) {
  const client = await prisma.clientProfile.findFirst({
    where: { id: clientProfileId, branchId },
    select: { id: true, paymentStatus: true, userId: true },
  });

  if (!client) {
    throw new AppError('NOT_FOUND', 'Client not found', 404);
  }

  const updated = await prisma.clientProfile.update({
    where: { id: clientProfileId },
    data: { paymentStatus },
  });

  await auditLog({
    action: 'PAYMENT_STATUS_UPDATED',
    actorId,
    subjectType: 'ClientProfile',
    subjectId: clientProfileId,
    branchId,
    oldValue: { paymentStatus: client.paymentStatus },
    newValue: { paymentStatus },
  });

  return updated;
}
