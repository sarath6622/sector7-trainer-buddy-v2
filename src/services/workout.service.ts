import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError } from '@/lib/errors';

interface WorkoutSetInput {
  setNumber: number;
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  rpe?: number;
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

  // Create workout logs with sets in an interactive transaction
  const workoutLogs = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const entry of exercises) {
      const log = await tx.workoutLog.create({
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
              notes: set.notes ?? null,
            })),
          },
        },
        include: {
          exercise: {
            select: { id: true, name: true, targetMuscleGroup: true, category: true },
          },
          sets: { orderBy: { setNumber: 'asc' } },
        },
      });
      results.push(log);
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

  return workoutLogs;
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
        notes: set.notes,
      })),
    });
  }

  const updated = await prisma.workoutLog.findUnique({
    where: { id: workoutLogId },
    include: {
      exercise: {
        select: { id: true, name: true, targetMuscleGroup: true, category: true },
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
