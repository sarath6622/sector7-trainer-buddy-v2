import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';
import {
  evaluatePRBadges,
  evaluateWeightLiftedBadges,
  evaluateExerciseMilestoneBadges,
  type NewBadge,
} from '@/services/badge.service';
import { createPost } from '@/services/community.service';

interface WorkoutSetInput {
  setNumber: number;
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  rpe?: number;
  restSec?: number;
  notes?: string;
}

interface WorkoutEntryInput {
  exerciseId: string;
  orderIndex: number;
  sets: WorkoutSetInput[];
}

interface CreateWorkoutInput {
  sessionInstanceId: string;
  exercises: WorkoutEntryInput[];
  trainerProfileId: string;
  actorId: string;
  branchId: string;
}

interface UpdateWorkoutLogInput {
  workoutLogId: string;
  sets?: WorkoutSetInput[];
  trainerProfileId: string;
  actorId: string;
  branchId: string;
}

interface GetSessionWorkoutsInput {
  sessionInstanceId: string;
  branchId: string;
}

interface ListClientWorkoutsInput {
  clientProfileId: string;
  branchId: string;
  dateFrom?: string;
  dateTo?: string;
  exerciseId?: string;
  muscleGroup?: string;
}

/**
 * Create workout logs for a session (batch of exercises with sets)
 */
export async function createWorkoutLogs({
  sessionInstanceId,
  exercises,
  trainerProfileId,
  actorId,
  branchId,
}: CreateWorkoutInput) {
  // Verify session belongs to this trainer and is IN_PROGRESS
  const session = await prisma.sessionInstance.findFirst({
    where: { id: sessionInstanceId, branchId, trainerProfileId },
  });

  if (!session) {
    throw new AppError('SESSION_NOT_FOUND', 'Session not found', 404);
  }

  if (session.status !== 'IN_PROGRESS' && session.status !== 'COMPLETED') {
    throw new AppError(
      'INVALID_STATUS',
      'Can only log workouts for active or completed sessions',
      400,
    );
  }

  // Verify all exercises exist
  const exerciseIds = exercises.map((e) => e.exerciseId);
  const existingExercises = await prisma.exercise.findMany({
    where: { id: { in: exerciseIds }, isActive: true },
    select: { id: true },
  });
  const existingIds = new Set(existingExercises.map((e) => e.id));

  const missingIds = exerciseIds.filter((id) => !existingIds.has(id));
  if (missingIds.length > 0) {
    throw new AppError('EXERCISE_NOT_FOUND', `Exercises not found: ${missingIds.join(', ')}`, 404);
  }

  // Reconcile incoming payload with existing logs, preserving createdAt on
  // unchanged rows. Auto-save fires every ~800ms, so a naïve delete-and-
  // recreate would bump every timestamp on every keystroke and destroy the
  // audit trail (admins need to know "when did the trainer add Bench Press"
  // and "how long between exercises"). The upsert path keeps WorkoutLog and
  // WorkoutSet identities stable across saves.
  const workoutLogs = await prisma.$transaction(async (tx) => {
    const existingLogs = await tx.workoutLog.findMany({
      where: { sessionInstanceId },
      include: { sets: true },
    });
    const existingByExId = new Map(existingLogs.map((l) => [l.exerciseId, l]));
    const incomingExIds = new Set(exercises.map((e) => e.exerciseId));

    // Drop logs (and their sets) for exercises the trainer removed since
    // the last save.
    const toDeleteLogIds = existingLogs
      .filter((l) => !incomingExIds.has(l.exerciseId))
      .map((l) => l.id);
    if (toDeleteLogIds.length > 0) {
      await tx.workoutSet.deleteMany({ where: { workoutLogId: { in: toDeleteLogIds } } });
      await tx.workoutLog.deleteMany({ where: { id: { in: toDeleteLogIds } } });
    }

    const results = [];
    for (const entry of exercises) {
      const existing = existingByExId.get(entry.exerciseId);
      let logId: string;

      if (existing) {
        // Keep the original log row (and createdAt). Just sync orderIndex
        // and the set children below.
        if (existing.orderIndex !== entry.orderIndex) {
          await tx.workoutLog.update({
            where: { id: existing.id },
            data: { orderIndex: entry.orderIndex },
          });
        }
        logId = existing.id;

        const existingBySetNum = new Map(existing.sets.map((s) => [s.setNumber, s]));
        const incomingSetNums = new Set(entry.sets.map((s) => s.setNumber));

        // Drop sets the trainer removed.
        const setIdsToDelete = existing.sets
          .filter((s) => !incomingSetNums.has(s.setNumber))
          .map((s) => s.id);
        if (setIdsToDelete.length > 0) {
          await tx.workoutSet.deleteMany({ where: { id: { in: setIdsToDelete } } });
        }

        for (const set of entry.sets) {
          const existingSet = existingBySetNum.get(set.setNumber);
          const data = {
            reps: set.reps ?? null,
            weightKg: set.weightKg ?? null,
            durationSec: set.durationSec ?? null,
            rpe: set.rpe ?? null,
            restSec: set.restSec ?? null,
            notes: set.notes ?? null,
          };
          if (existingSet) {
            await tx.workoutSet.update({ where: { id: existingSet.id }, data });
          } else {
            await tx.workoutSet.create({
              data: { workoutLogId: logId, setNumber: set.setNumber, ...data },
            });
          }
        }
      } else {
        const created = await tx.workoutLog.create({
          data: {
            sessionInstanceId,
            exerciseId: entry.exerciseId,
            orderIndex: entry.orderIndex,
            sets: {
              create: entry.sets.map((set) => ({
                setNumber: set.setNumber,
                reps: set.reps ?? null,
                weightKg: set.weightKg ?? null,
                durationSec: set.durationSec ?? null,
                rpe: set.rpe ?? null,
                restSec: set.restSec ?? null,
                notes: set.notes ?? null,
              })),
            },
          },
        });
        logId = created.id;
      }

      const final = await tx.workoutLog.findUnique({
        where: { id: logId },
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              targetMuscleGroup: true,
              category: true,
              exerciseType: true,
            },
          },
          sets: { orderBy: { setNumber: 'asc' } },
        },
      });
      if (final) results.push(final);
    }
    return results;
  });

  await auditLog({
    action: 'WORKOUT_LOGGED',
    actorId,
    subjectType: 'SessionInstance',
    subjectId: sessionInstanceId,
    branchId,
    newValue: {
      exerciseCount: exercises.length,
      totalSets: exercises.reduce((sum, e) => sum + e.sets.length, 0),
    },
    metadata: { trainerProfileId },
  });

  // Evaluate badges for all exercise types (non-blocking)
  const newBadges: NewBadge[] = [];
  const autoGeneratedPostIds: string[] = [];
  try {
    for (const log of workoutLogs) {
      const maxWeight = Math.max(...log.sets.map((s) => s.weightKg ?? 0));
      if (maxWeight > 0) {
        const prBadges = await evaluatePRBadges(
          session.clientProfileId,
          branchId,
          log.exercise.id,
          log.exercise.name,
          maxWeight,
          actorId,
          session.id,
        );
        newBadges.push(...prBadges);

        // Auto-post compound PR to community feed (ADR-020: opt-out, default on)
        // Detect PR independently of badge system — badges may already exist for the exercise
        // but we still want to post when a new weight record is set.
        const exerciseMeta = await prisma.exercise.findUnique({
          where: { id: log.exercise.id },
          select: { isCompound: true },
        });
        if (exerciseMeta?.isCompound) {
          // Check previous max weight for this client + exercise (excluding current session)
          const previousBest = await prisma.workoutSet.aggregate({
            where: {
              workoutLog: {
                exercise: { id: log.exercise.id },
                sessionInstance: {
                  clientProfileId: session.clientProfileId,
                  branchId,
                  id: { not: session.id }, // exclude current session
                },
              },
              weightKg: { not: null },
            },
            _max: { weightKg: true },
          });
          const prevMaxKg = previousBest._max.weightKg ?? 0;
          if (maxWeight > prevMaxKg) {
            const maxReps = log.sets.find((s) => s.weightKg === maxWeight)?.reps ?? undefined;
            try {
              // Dedup: auto-save fires on every keystroke, so naively creating
              // a post per save spams the feed. If a post for this client +
              // exercise already exists from the current session, update it
              // in place rather than creating a new one.
              const sessionStart = session.startedAt ?? session.scheduledDate;
              const existingAutoPost = await prisma.communityPost.findFirst({
                where: {
                  branchId,
                  clientProfileId: session.clientProfileId,
                  exerciseId: log.exercise.id,
                  isAutoGenerated: true,
                  createdAt: { gte: sessionStart },
                },
                orderBy: { createdAt: 'desc' },
              });

              if (existingAutoPost) {
                if (maxWeight > (existingAutoPost.weightKg ?? 0)) {
                  await prisma.communityPost.update({
                    where: { id: existingAutoPost.id },
                    data: { weightKg: maxWeight, reps: maxReps },
                  });
                }
                // Don't push the ID — the banner already appeared on the
                // initial save; subsequent saves shouldn't re-trigger it.
              } else {
                const post = await createPost({
                  branchId,
                  clientProfileId: session.clientProfileId,
                  exerciseId: log.exercise.id,
                  weightKg: maxWeight,
                  reps: maxReps,
                  isAutoGenerated: true,
                  actorId,
                });
                autoGeneratedPostIds.push(post.id);
              }
            } catch {
              // community post failure must never break workout save
            }
          }
        }

        const wlBadges = await evaluateWeightLiftedBadges(
          session.clientProfileId,
          branchId,
          log.exercise.id,
          maxWeight,
          actorId,
        );
        newBadges.push(...wlBadges);
      }

      // Exercise milestone badges: evaluate for all exercise types (weight, reps, duration)
      const emBadges = await evaluateExerciseMilestoneBadges(
        session.clientProfileId,
        branchId,
        log.exercise.id,
        log.sets,
        actorId,
      );
      newBadges.push(...emBadges);
    }
  } catch (err) {
    // badge evaluation failure must never break workout save — but surface
    // the error so silent regressions are visible in server logs.
    console.error('[workout.service] badge evaluation failed', err);
  }

  return { workoutLogs, newBadges, autoGeneratedPostIds };
}

/**
 * Update a workout log (replace sets)
 */
export async function updateWorkoutLog({
  workoutLogId,
  sets,
  trainerProfileId,
  actorId,
  branchId,
}: UpdateWorkoutLogInput) {
  const workoutLog = await prisma.workoutLog.findUnique({
    where: { id: workoutLogId },
    include: {
      sessionInstance: { select: { branchId: true, trainerProfileId: true } },
      sets: true,
    },
  });

  if (!workoutLog) {
    throw new AppError('WORKOUT_LOG_NOT_FOUND', 'Workout log not found', 404);
  }

  if (workoutLog.sessionInstance.branchId !== branchId) {
    throw new AppError('FORBIDDEN', 'Access denied', 403);
  }

  if (workoutLog.sessionInstance.trainerProfileId !== trainerProfileId) {
    throw new AppError('FORBIDDEN', 'Not your session', 403);
  }

  if (sets) {
    // Delete existing sets and recreate
    await prisma.workoutSet.deleteMany({ where: { workoutLogId } });
    await prisma.workoutSet.createMany({
      data: sets.map((set) => ({
        workoutLogId,
        setNumber: set.setNumber,
        reps: set.reps,
        weightKg: set.weightKg,
        durationSec: set.durationSec,
        rpe: set.rpe,
        restSec: set.restSec,
        notes: set.notes,
      })),
    });
  }

  const updated = await prisma.workoutLog.findUnique({
    where: { id: workoutLogId },
    include: {
      exercise: {
        select: {
          id: true,
          name: true,
          targetMuscleGroup: true,
          category: true,
          exerciseType: true,
        },
      },
      sets: { orderBy: { setNumber: 'asc' } },
    },
  });

  await auditLog({
    action: 'WORKOUT_UPDATED',
    actorId,
    subjectType: 'WorkoutLog',
    subjectId: workoutLogId,
    branchId,
    metadata: { trainerProfileId },
  });

  return updated;
}

/**
 * Delete a workout log and its sets
 */
export async function deleteWorkoutLog(
  workoutLogId: string,
  trainerProfileId: string,
  actorId: string,
  branchId: string,
) {
  const workoutLog = await prisma.workoutLog.findUnique({
    where: { id: workoutLogId },
    include: {
      sessionInstance: { select: { branchId: true, trainerProfileId: true } },
    },
  });

  if (!workoutLog) {
    throw new AppError('WORKOUT_LOG_NOT_FOUND', 'Workout log not found', 404);
  }

  if (workoutLog.sessionInstance.branchId !== branchId) {
    throw new AppError('FORBIDDEN', 'Access denied', 403);
  }

  if (workoutLog.sessionInstance.trainerProfileId !== trainerProfileId) {
    throw new AppError('FORBIDDEN', 'Not your session', 403);
  }

  await prisma.workoutSet.deleteMany({ where: { workoutLogId } });
  await prisma.workoutLog.delete({ where: { id: workoutLogId } });

  await auditLog({
    action: 'WORKOUT_DELETED',
    actorId,
    subjectType: 'WorkoutLog',
    subjectId: workoutLogId,
    branchId,
    metadata: { trainerProfileId },
  });

  return { success: true };
}

/**
 * Get all workout logs for a session
 */
export async function getSessionWorkouts({ sessionInstanceId, branchId }: GetSessionWorkoutsInput) {
  const session = await prisma.sessionInstance.findFirst({
    where: { id: sessionInstanceId, branchId },
  });

  if (!session) {
    throw new AppError('SESSION_NOT_FOUND', 'Session not found', 404);
  }

  return prisma.workoutLog.findMany({
    where: { sessionInstanceId },
    include: {
      exercise: {
        select: {
          id: true,
          name: true,
          targetMuscleGroup: true,
          category: true,
          exerciseType: true,
          equipmentRequired: true,
        },
      },
      sets: { orderBy: { setNumber: 'asc' } },
    },
    orderBy: { orderIndex: 'asc' },
  });
}

/**
 * Get workout history for a client (with filters)
 */
export async function getClientWorkouts({
  clientProfileId,
  branchId,
  dateFrom,
  dateTo,
  exerciseId,
  muscleGroup,
}: ListClientWorkoutsInput) {
  const sessionWhere: Record<string, unknown> = { branchId, clientProfileId };

  if (dateFrom || dateTo) {
    const dateFilter: Record<string, unknown> = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo);
    sessionWhere.scheduledDate = dateFilter;
  }

  const workoutWhere: Record<string, unknown> = {
    sessionInstance: sessionWhere,
  };

  if (exerciseId) {
    workoutWhere.exerciseId = exerciseId;
  }

  if (muscleGroup) {
    workoutWhere.exercise = {
      targetMuscleGroup: { contains: muscleGroup, mode: 'insensitive' },
    };
  }

  return prisma.workoutLog.findMany({
    where: workoutWhere,
    include: {
      exercise: {
        select: {
          id: true,
          name: true,
          targetMuscleGroup: true,
          category: true,
          exerciseType: true,
          equipmentRequired: true,
        },
      },
      sets: { orderBy: { setNumber: 'asc' } },
      sessionInstance: {
        select: {
          id: true,
          scheduledDate: true,
          scheduledTime: true,
          status: true,
          trainer: {
            include: { user: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
    orderBy: [{ sessionInstance: { scheduledDate: 'desc' } }, { orderIndex: 'asc' }],
  });
}
