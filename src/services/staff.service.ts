import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import {
  ADMIN_ROLES,
  STAFF_ROLES,
  TRAINER_ROLES,
  accessLevelOf,
  isAdminRoles,
  isTrainerRoles,
  type AccessLevel,
} from '@/lib/roles';
import type { Prisma, UserRole } from '@prisma/client';

/**
 * Staff & Access (ADR-054). Per-person admin / head coach / trainer accounts
 * replace the shared admin login. "Access level" is a preset over User.roles.
 */

const ADMIN = ADMIN_ROLES as readonly string[];
const TRAINER = TRAINER_ROLES as readonly string[];
const STAFF = STAFF_ROLES as readonly string[];

interface AdminAccessChange {
  targetId: string;
  branchId: string;
  actorId: string;
  oldRoles: readonly string[];
  newRoles: readonly string[];
  oldActive: boolean;
  newActive: boolean;
}

/**
 * Reject a change that takes admin access away from yourself, or from the
 * branch's last active admin. Called by every path that can remove admin
 * access: staff access changes, the generic user update, and soft delete.
 */
export async function assertAdminAccessChangeAllowed(change: AdminAccessChange) {
  const hadAdmin = change.oldActive && isAdminRoles(change.oldRoles);
  const keepsAdmin = change.newActive && isAdminRoles(change.newRoles);
  if (!hadAdmin || keepsAdmin) return;

  if (change.targetId === change.actorId) {
    throw new AppError(
      'CANNOT_CHANGE_OWN_ACCESS',
      'You cannot remove your own admin access. Ask another admin to do it.',
      409,
    );
  }

  const otherAdmins = await prisma.user.count({
    where: {
      branchId: change.branchId,
      id: { not: change.targetId },
      isActive: true,
      deletedAt: null,
      roles: { hasSome: [...ADMIN_ROLES] },
    },
  });
  if (otherAdmins === 0) {
    throw new AppError(
      'LAST_ADMIN',
      'This is the only active admin. Give someone else admin access first.',
      409,
    );
  }
}

/**
 * Rewrite only the staff roles for an access level, keeping any others
 * (e.g. CLIENT). Existing admin and trainer specialisations are preserved.
 */
export function rolesForAccessLevel(current: readonly string[], level: AccessLevel): UserRole[] {
  const others = current.filter((r) => !STAFF.includes(r));
  const heldAdmin = current.filter((r) => ADMIN.includes(r));
  const heldTrainer = current.filter((r) => TRAINER.includes(r));
  const adminRoles = heldAdmin.length > 0 ? heldAdmin : ['BRANCH_ADMIN'];
  const trainerRoles = heldTrainer.length > 0 ? heldTrainer : ['TRAINER'];

  const staff =
    level === 'ADMIN'
      ? adminRoles
      : level === 'HEAD_COACH'
        ? [...adminRoles, ...trainerRoles]
        : trainerRoles;
  return [...staff, ...others] as UserRole[];
}

const staffSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  profileImageUrl: true,
  roles: true,
  isActive: true,
  lastLoginAt: true,
  trainerProfile: {
    select: {
      id: true,
      _count: { select: { ptPackages: { where: { isActive: true } } } },
    },
  },
} satisfies Prisma.UserSelect;

type StaffRow = Prisma.UserGetPayload<{ select: typeof staffSelect }>;

function toStaffMember(user: StaffRow) {
  const { trainerProfile, ...rest } = user;
  return {
    ...rest,
    accessLevel: accessLevelOf(user.roles) as AccessLevel,
    trainerProfileId: trainerProfile?.id ?? null,
    activeClientCount: trainerProfile?._count.ptPackages ?? 0,
  };
}

export type StaffMember = ReturnType<typeof toStaffMember>;

const LEVEL_ORDER: Record<AccessLevel, number> = { HEAD_COACH: 0, ADMIN: 1, TRAINER: 2 };

export async function listStaff(branchId: string) {
  const users = await prisma.user.findMany({
    where: { branchId, deletedAt: null, roles: { hasSome: [...STAFF_ROLES] } },
    select: staffSelect,
  });

  const data = users.map(toStaffMember).sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    const byLevel = LEVEL_ORDER[a.accessLevel] - LEVEL_ORDER[b.accessLevel];
    if (byLevel !== 0) return byLevel;
    return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
  });

  const activeAdminCount = data.filter((s) => s.isActive && isAdminRoles(s.roles)).length;
  return { data, activeAdminCount };
}

interface UpdateStaffAccessInput {
  id: string;
  branchId: string;
  actorId: string;
  accessLevel?: AccessLevel;
  isActive?: boolean;
}

export async function updateStaffAccess(input: UpdateStaffAccessInput) {
  const { id, branchId, actorId } = input;

  const existing = await prisma.user.findFirst({
    where: { id, branchId, deletedAt: null, roles: { hasSome: [...STAFF_ROLES] } },
    select: staffSelect,
  });
  if (!existing) {
    throw new AppError('NOT_FOUND', 'Staff member not found', 404);
  }

  const newRoles = input.accessLevel
    ? rolesForAccessLevel(existing.roles, input.accessLevel)
    : existing.roles;
  const newActive = input.isActive ?? existing.isActive;

  await assertAdminAccessChangeAllowed({
    targetId: id,
    branchId,
    actorId,
    oldRoles: existing.roles,
    newRoles,
    oldActive: existing.isActive,
    newActive,
  });

  // Dropping the trainer side would strand their clients' schedules.
  const activeClients = existing.trainerProfile?._count.ptPackages ?? 0;
  if (isTrainerRoles(existing.roles) && !isTrainerRoles(newRoles) && activeClients > 0) {
    throw new AppError(
      'HAS_ACTIVE_CLIENTS',
      `${existing.firstName} still has ${activeClients} active client${activeClients === 1 ? '' : 's'}. Reassign them first.`,
      409,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { roles: newRoles, isActive: newActive } });
    // A new head coach needs a TrainerProfile to be scheduled and to log sessions.
    if (isTrainerRoles(newRoles) && !existing.trainerProfile) {
      await tx.trainerProfile.create({
        data: { userId: id, branchId, specialties: [], certifications: [], workingDays: [] },
      });
    }
  });

  await auditLog({
    action: 'STAFF_ACCESS_UPDATED',
    actorId,
    subjectType: 'User',
    subjectId: id,
    oldValue: { roles: existing.roles, isActive: existing.isActive },
    newValue: { roles: newRoles, isActive: newActive },
    branchId,
  });

  const updated = await prisma.user.findUniqueOrThrow({ where: { id }, select: staffSelect });
  return toStaffMember(updated);
}
