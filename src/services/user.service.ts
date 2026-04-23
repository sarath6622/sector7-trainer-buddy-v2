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

interface ListUsersInput {
  branchId: string;
  role?: UserRole;
  page: number;
  pageSize: number;
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
  const { branchId, role, page, pageSize } = input;

  const where: Prisma.UserWhereInput = {
    branchId,
    deletedAt: null,
    ...(role ? { roles: { hasSome: [role] } } : {}),
  };

  const [users, total] = await Promise.all([
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
  ]);

  return {
    data: users,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
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
