import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import type {
  Prisma,
  GenderFilter,
  BadgeType,
  ThresholdUnit,
  DurationCondition,
} from '@prisma/client';
import type {
  CreateBadgeDefinitionInput,
  UpdateBadgeDefinitionInput,
  ListBadgeDefinitionsInput,
} from '@/lib/validators';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NewBadge {
  badgeDefinitionId: string;
  name: string;
  description: string;
  icon: string;
}

// ─── CRUD: Badge Definitions ────────────────────────────────────────────────

export async function createBadgeDefinition(input: CreateBadgeDefinitionInput, actorId: string) {
  const data: Prisma.BadgeDefinitionCreateInput = {
    type: input.type,
    name: input.name,
    description: input.description,
    howToEarn: input.howToEarn,
    icon: input.icon,
    imageUrl: input.imageUrl || undefined,
    thresholdValue: input.thresholdValue,
    thresholdUnit: (input.thresholdUnit as ThresholdUnit) || undefined,
    durationCondition: (input.durationCondition as DurationCondition) || undefined,
    genderFilter: input.genderFilter as GenderFilter,
    isActive: input.isActive,
  };

  if (input.exerciseId) {
    data.exercise = { connect: { id: input.exerciseId } };
  }

  const badge = await prisma.badgeDefinition.create({
    data,
    include: { exercise: { select: { id: true, name: true } } },
  });

  await auditLog({
    action: 'BADGE_DEFINITION_CREATED',
    actorId,
    subjectType: 'BadgeDefinition',
    subjectId: badge.id,
    newValue: { name: badge.name, type: badge.type, genderFilter: badge.genderFilter },
    branchId: '',
  });

  return badge;
}

export async function updateBadgeDefinition(
  id: string,
  input: UpdateBadgeDefinitionInput,
  actorId: string,
) {
  const existing = await prisma.badgeDefinition.findUnique({ where: { id } });
  if (!existing) throw new AppError('NOT_FOUND', 'Badge definition not found', 404);

  const data: Prisma.BadgeDefinitionUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.description !== undefined) data.description = input.description;
  if (input.howToEarn !== undefined) data.howToEarn = input.howToEarn || null;
  if (input.icon !== undefined) data.icon = input.icon;
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl || null;
  if (input.thresholdValue !== undefined) data.thresholdValue = input.thresholdValue;
  if (input.genderFilter !== undefined) data.genderFilter = input.genderFilter as GenderFilter;
  if (input.type !== undefined) data.type = input.type;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  if (input.thresholdUnit !== undefined)
    data.thresholdUnit = (input.thresholdUnit as ThresholdUnit) || null;
  if (input.durationCondition !== undefined)
    data.durationCondition = (input.durationCondition as DurationCondition) || null;

  if (input.exerciseId !== undefined) {
    data.exercise = input.exerciseId ? { connect: { id: input.exerciseId } } : { disconnect: true };
  }

  const updated = await prisma.badgeDefinition.update({
    where: { id },
    data,
    include: { exercise: { select: { id: true, name: true } } },
  });

  await auditLog({
    action: 'BADGE_DEFINITION_UPDATED',
    actorId,
    subjectType: 'BadgeDefinition',
    subjectId: id,
    oldValue: { name: existing.name, type: existing.type, genderFilter: existing.genderFilter },
    newValue: { name: updated.name, type: updated.type, genderFilter: updated.genderFilter },
    branchId: '',
  });

  return updated;
}

export async function getBadgeDefinitionById(id: string) {
  const badge = await prisma.badgeDefinition.findUnique({
    where: { id },
    include: { exercise: { select: { id: true, name: true } } },
  });
  if (!badge) throw new AppError('NOT_FOUND', 'Badge definition not found', 404);
  return badge;
}

export async function listBadgeDefinitions(input: ListBadgeDefinitionsInput) {
  const { page, pageSize, type, search, genderFilter } = input;

  const where: Prisma.BadgeDefinitionWhereInput = {};
  if (type) where.type = type as BadgeType;
  if (genderFilter) where.genderFilter = genderFilter as GenderFilter;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.badgeDefinition.findMany({
      where,
      include: { exercise: { select: { id: true, name: true } } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.badgeDefinition.count({ where }),
  ]);

  return {
    data,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

export async function deleteBadgeDefinition(id: string, actorId: string) {
  const existing = await prisma.badgeDefinition.findUnique({ where: { id } });
  if (!existing) throw new AppError('NOT_FOUND', 'Badge definition not found', 404);

  await prisma.badgeDefinition.update({ where: { id }, data: { isActive: false } });

  await auditLog({
    action: 'BADGE_DEFINITION_DEACTIVATED',
    actorId,
    subjectType: 'BadgeDefinition',
    subjectId: id,
    oldValue: { name: existing.name, isActive: true },
    newValue: { isActive: false },
    branchId: '',
  });

  return { success: true };
}

// ─── Award (idempotent) ─────────────────────────────────────────────────────

/**
 * Award a badge to a client. Idempotent — if already awarded, returns null.
 * `context` is "" for non-contextual badges or exerciseId for PR/WEIGHT_LIFTED badges.
 */
async function awardBadge(
  clientProfileId: string,
  branchId: string,
  badgeDefinitionId: string,
  context: string,
  metadata: Prisma.InputJsonValue | undefined,
  actorId: string,
): Promise<NewBadge | null> {
  const existing = await prisma.userBadge.findUnique({
    where: {
      clientProfileId_badgeDefinitionId_context: { clientProfileId, badgeDefinitionId, context },
    },
  });
  if (existing) return null;

  const badge = await prisma.badgeDefinition.findUnique({ where: { id: badgeDefinitionId } });
  if (!badge || !badge.isActive) return null;

  await prisma.userBadge.create({
    data: { branchId, clientProfileId, badgeDefinitionId, context, metadata },
  });

  await auditLog({
    action: 'BADGE_AWARDED',
    actorId,
    subjectType: 'UserBadge',
    subjectId: `${clientProfileId}:${badgeDefinitionId}`,
    newValue: { badgeDefinitionId, name: badge.name, context },
    branchId,
  });

  return {
    badgeDefinitionId: badge.id,
    name: badge.name,
    description: badge.description,
    icon: badge.icon,
  };
}

// ─── Gender-filtered definitions helper ─────────────────────────────────────

/**
 * Returns active badge definitions for a type, filtered by the client's gender.
 * Clients without gender set only see 'ALL' badges.
 */
async function getGenderFilteredDefinitions(type: BadgeType, clientProfileId: string) {
  const client = await prisma.clientProfile.findUnique({
    where: { id: clientProfileId },
    select: { gender: true },
  });

  const genderFilters: GenderFilter[] = ['ALL'];
  if (client?.gender) {
    genderFilters.push(client.gender as unknown as GenderFilter);
  }

  return prisma.badgeDefinition.findMany({
    where: { type, isActive: true, genderFilter: { in: genderFilters } },
  });
}

// ─── Get Badges ─────────────────────────────────────────────────────────────

export async function getUserBadges(clientProfileId: string, branchId: string) {
  const client = await prisma.clientProfile.findFirst({ where: { id: clientProfileId, branchId } });
  if (!client) throw new AppError('NOT_FOUND', 'Client not found', 404);

  // Determine which genderFilters this client can see
  const genderFilters: GenderFilter[] = ['ALL'];
  if (client.gender) {
    genderFilters.push(client.gender as unknown as GenderFilter);
  }

  const allDefinitions = await prisma.badgeDefinition.findMany({
    where: { isActive: true, genderFilter: { in: genderFilters } },
    orderBy: { type: 'asc' },
  });
  const earned = await prisma.userBadge.findMany({
    where: { clientProfileId, branchId },
    include: { badgeDefinition: true },
    orderBy: { awardedAt: 'desc' },
  });

  const earnedIds = new Set(earned.map((b) => b.badgeDefinitionId));

  return {
    earned,
    locked: allDefinitions.filter((d) => !earnedIds.has(d.id)),
  };
}

// ─── Toggle display ──────────────────────────────────────────────────────────

export async function toggleBadgeDisplay(
  userBadgeId: string,
  clientProfileId: string,
  displayOnProfile: boolean,
) {
  const badge = await prisma.userBadge.findFirst({ where: { id: userBadgeId, clientProfileId } });
  if (!badge) throw new AppError('NOT_FOUND', 'Badge not found', 404);

  return prisma.userBadge.update({ where: { id: userBadgeId }, data: { displayOnProfile } });
}

// ─── Unseen badges ───────────────────────────────────────────────────────────

/**
 * Returns badges the client hasn't seen yet (seenByClient = false).
 */
export async function getUnseenBadges(clientProfileId: string, branchId: string) {
  return prisma.userBadge.findMany({
    where: { clientProfileId, branchId, seenByClient: false },
    include: { badgeDefinition: true },
    orderBy: { awardedAt: 'desc' },
  });
}

/**
 * Marks all unseen badges as seen for a client.
 */
export async function markBadgesSeen(clientProfileId: string, branchId: string) {
  await prisma.userBadge.updateMany({
    where: { clientProfileId, branchId, seenByClient: false },
    data: { seenByClient: true },
  });
}

// ─── Evaluation: Streak ─────────────────────────────────────────────────────

/**
 * Evaluate consecutive-session streak. A streak resets if there's a gap of
 * more than 7 days between consecutive completed sessions.
 * Awards badges dynamically based on DB-configured thresholds.
 */
export async function evaluateStreakBadges(
  clientProfileId: string,
  branchId: string,
  actorId: string,
): Promise<NewBadge[]> {
  const sessions = await prisma.sessionInstance.findMany({
    where: { clientProfileId, branchId, status: 'COMPLETED' },
    orderBy: { scheduledDate: 'asc' },
    select: { scheduledDate: true },
  });

  if (sessions.length === 0) return [];

  // Calculate current streak (count back from latest, reset if gap > 7 days)
  let streak = 1;
  for (let i = sessions.length - 1; i > 0; i--) {
    const curr = sessions[i];
    const prev = sessions[i - 1];
    if (!curr || !prev) break;
    const diff =
      (new Date(curr.scheduledDate).getTime() - new Date(prev.scheduledDate).getTime()) /
      (1000 * 60 * 60 * 24);
    if (diff <= 7) {
      streak++;
    } else {
      break;
    }
  }

  const definitions = await getGenderFilteredDefinitions('STREAK', clientProfileId);
  const newBadges: NewBadge[] = [];

  for (const def of definitions) {
    if (def.thresholdValue && streak >= def.thresholdValue) {
      const awarded = await awardBadge(clientProfileId, branchId, def.id, '', undefined, actorId);
      if (awarded) newBadges.push(awarded);
    }
  }

  return newBadges;
}

// ─── Evaluation: Session Milestone ──────────────────────────────────────────

/**
 * Awards badges at total completed session counts, driven by DB definitions.
 */
export async function evaluateSessionMilestoneBadges(
  clientProfileId: string,
  branchId: string,
  actorId: string,
): Promise<NewBadge[]> {
  const total = await prisma.sessionInstance.count({
    where: { clientProfileId, branchId, status: 'COMPLETED' },
  });

  const definitions = await getGenderFilteredDefinitions('SESSION_MILESTONE', clientProfileId);
  const newBadges: NewBadge[] = [];

  for (const def of definitions) {
    if (def.thresholdValue && total >= def.thresholdValue) {
      const awarded = await awardBadge(clientProfileId, branchId, def.id, '', undefined, actorId);
      if (awarded) newBadges.push(awarded);
    }
  }

  return newBadges;
}

// ─── Evaluation: Personal Record ────────────────────────────────────────────

/**
 * Checks if the given weight is a new lifetime PR for this exercise.
 * Awards a PR badge (one per exercise) if so.
 */
export async function evaluatePRBadges(
  clientProfileId: string,
  branchId: string,
  exerciseId: string,
  exerciseName: string,
  currentWeightKg: number,
  actorId: string,
  currentSessionInstanceId?: string,
): Promise<NewBadge[]> {
  // Exclude the current session from the lookup — badge evaluation runs after
  // the workout sets have been committed, so without this exclusion the
  // just-saved sets would be part of `prevMax` and the PR would never trigger.
  const previousMax = await prisma.workoutSet.aggregate({
    where: {
      workoutLog: {
        exercise: { id: exerciseId },
        sessionInstance: {
          clientProfileId,
          branchId,
          ...(currentSessionInstanceId && { id: { not: currentSessionInstanceId } }),
        },
      },
      weightKg: { not: null },
    },
    _max: { weightKg: true },
  });

  const prevMaxKg = previousMax._max.weightKg ?? 0;
  if (currentWeightKg <= prevMaxKg) return [];

  const definitions = await getGenderFilteredDefinitions('PERSONAL_RECORD', clientProfileId);
  if (definitions.length === 0) return [];

  const def = definitions[0];
  if (!def) return [];

  // For PR badges, context = exerciseId so each exercise can have its own PR badge
  // upsert-style: update metadata if already awarded
  const existing = await prisma.userBadge.findUnique({
    where: {
      clientProfileId_badgeDefinitionId_context: {
        clientProfileId,
        badgeDefinitionId: def.id,
        context: exerciseId,
      },
    },
  });

  if (existing) {
    await prisma.userBadge.update({
      where: { id: existing.id },
      data: { metadata: { exerciseName, weightKg: currentWeightKg }, awardedAt: new Date() },
    });
    return [];
  }

  const awarded = await awardBadge(
    clientProfileId,
    branchId,
    def.id,
    exerciseId,
    { exerciseName, weightKg: currentWeightKg },
    actorId,
  );
  return awarded ? [awarded] : [];
}

// ─── Evaluation: Body Composition ───────────────────────────────────────────

/**
 * Awards badges based on total weight lost from the first recorded weight.
 * Thresholds driven by DB definitions.
 */
export async function evaluateBodyCompositionBadges(
  clientProfileId: string,
  branchId: string,
  actorId: string,
): Promise<NewBadge[]> {
  const entries = await prisma.progressEntry.findMany({
    where: { clientProfileId, weightKg: { not: null } },
    orderBy: { recordedAt: 'asc' },
    select: { weightKg: true },
  });

  if (entries.length < 2) return [];

  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];
  if (!firstEntry?.weightKg || !lastEntry?.weightKg) return [];

  const lost = firstEntry.weightKg - lastEntry.weightKg;

  if (lost <= 0) return [];

  const definitions = await getGenderFilteredDefinitions('BODY_COMPOSITION', clientProfileId);
  const newBadges: NewBadge[] = [];

  for (const def of definitions) {
    if (def.thresholdValue && lost >= def.thresholdValue) {
      const awarded = await awardBadge(clientProfileId, branchId, def.id, '', undefined, actorId);
      if (awarded) newBadges.push(awarded);
    }
  }

  return newBadges;
}

// ─── Evaluation: Weight Lifted ──────────────────────────────────────────────

/**
 * Awards badges for lifting an absolute weight threshold on a specific exercise.
 * E.g. "100kg Bench Press Club" (men) / "60kg Bench Press Club" (women).
 */
export async function evaluateWeightLiftedBadges(
  clientProfileId: string,
  branchId: string,
  exerciseId: string,
  currentWeightKg: number,
  actorId: string,
): Promise<NewBadge[]> {
  const definitions = await getGenderFilteredDefinitions('WEIGHT_LIFTED', clientProfileId);

  // Filter to definitions for this specific exercise that the user qualifies for,
  // then pick only the highest threshold badge (avoid awarding all lower tiers).
  const qualifying = definitions
    .filter(
      (d) => d.exerciseId === exerciseId && d.thresholdValue && currentWeightKg >= d.thresholdValue,
    )
    .sort((a, b) => (b.thresholdValue ?? 0) - (a.thresholdValue ?? 0));

  const def = qualifying[0];
  if (!def) return [];

  const awarded = await awardBadge(
    clientProfileId,
    branchId,
    def.id,
    exerciseId,
    undefined,
    actorId,
  );
  return awarded ? [awarded] : [];
}

// ─── Evaluation: Exercise Milestone ────────────────────────────────────────

/**
 * Awards badges for reaching an exercise-specific threshold.
 * Supports three units:
 *   KG      — max weight lifted (weighted exercises)
 *   REPS    — max reps in a single set (bodyweight exercises)
 *   SECONDS — max or min duration in a single set (duration exercises),
 *             controlled by durationCondition (LONGER_IS_BETTER / SHORTER_IS_BETTER)
 */
export async function evaluateExerciseMilestoneBadges(
  clientProfileId: string,
  branchId: string,
  exerciseId: string,
  sets: { weightKg?: number | null; reps?: number | null; durationSec?: number | null }[],
  actorId: string,
): Promise<NewBadge[]> {
  const definitions = await getGenderFilteredDefinitions('EXERCISE_MILESTONE', clientProfileId);
  const exerciseDefs = definitions.filter((d) => d.exerciseId === exerciseId);
  if (exerciseDefs.length === 0) return [];

  const newBadges: NewBadge[] = [];

  // For each threshold unit, collect qualifying defs and pick only the highest.
  // This prevents awarding all lower-tier badges when a user clears a top threshold.
  const maxWeight = Math.max(...sets.map((s) => s.weightKg ?? 0));
  const maxReps = Math.max(...sets.map((s) => s.reps ?? 0));
  const durations = sets.map((s) => s.durationSec ?? 0).filter((d) => d > 0);

  const qualifyingByUnit: Record<string, typeof exerciseDefs> = {};

  for (const def of exerciseDefs) {
    if (!def.thresholdValue || !def.thresholdUnit) continue;

    let achieved = false;

    switch (def.thresholdUnit) {
      case 'KG':
        achieved = maxWeight >= def.thresholdValue;
        break;
      case 'REPS':
        achieved = maxReps >= def.thresholdValue;
        break;
      case 'SECONDS': {
        if (durations.length === 0) break;
        if (def.durationCondition === 'SHORTER_IS_BETTER') {
          achieved = Math.min(...durations) <= def.thresholdValue;
        } else {
          achieved = Math.max(...durations) >= def.thresholdValue;
        }
        break;
      }
    }

    if (achieved) {
      const key = def.thresholdUnit;
      if (!qualifyingByUnit[key]) qualifyingByUnit[key] = [];
      qualifyingByUnit[key]!.push(def);
    }
  }

  // Award only the highest-threshold badge per unit type
  for (const [unit, defs] of Object.entries(qualifyingByUnit)) {
    const sorted = [...defs].sort((a, b) => {
      if (unit === 'SECONDS' && defs[0]?.durationCondition === 'SHORTER_IS_BETTER') {
        // Lower threshold = harder (faster time) → pick lowest threshold value
        return (a.thresholdValue ?? 0) - (b.thresholdValue ?? 0);
      }
      return (b.thresholdValue ?? 0) - (a.thresholdValue ?? 0);
    });

    const top = sorted[0];
    if (!top) continue;

    const awarded = await awardBadge(
      clientProfileId,
      branchId,
      top.id,
      exerciseId,
      undefined,
      actorId,
    );
    if (awarded) newBadges.push(awarded);
  }

  return newBadges;
}
