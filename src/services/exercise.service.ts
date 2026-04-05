import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import type { ExerciseCategory, DifficultyLevel, ExerciseType } from '@prisma/client';

interface CreateExerciseInput {
  name: string;
  targetMuscleGroup: string;
  secondaryMuscles?: string[];
  equipmentRequired?: string;
  difficulty?: DifficultyLevel;
  category: ExerciseCategory;
  exerciseType?: ExerciseType;
  isCompound?: boolean;
  instructions?: string;
  demoVideoUrl?: string;
  demoGifUrl?: string;
  actorId: string;
  branchId: string;
}

interface UpdateExerciseInput {
  exerciseId: string;
  name?: string;
  targetMuscleGroup?: string;
  secondaryMuscles?: string[];
  equipmentRequired?: string;
  difficulty?: DifficultyLevel;
  category?: ExerciseCategory;
  exerciseType?: ExerciseType;
  isCompound?: boolean;
  instructions?: string;
  demoVideoUrl?: string;
  demoGifUrl?: string;
  isActive?: boolean;
  actorId: string;
  branchId: string;
}

interface ListExercisesInput {
  search?: string;
  muscleGroup?: string;
  category?: ExerciseCategory;
  page: number;
  pageSize: number;
}

interface BulkImportInput {
  exercises: {
    name: string;
    targetMuscleGroup: string;
    secondaryMuscles?: string[];
    equipmentRequired?: string;
    difficulty?: DifficultyLevel;
    category: ExerciseCategory;
    exerciseType?: ExerciseType;
    instructions?: string;
    demoVideoUrl?: string;
    demoGifUrl?: string;
  }[];
  actorId: string;
  branchId: string;
}

/**
 * Create a new exercise in the global library
 */
export async function createExercise({ actorId, branchId, ...data }: CreateExerciseInput) {
  const exercise = await prisma.exercise.create({
    data: {
      name: data.name,
      targetMuscleGroup: data.targetMuscleGroup,
      secondaryMuscles: data.secondaryMuscles ?? [],
      equipmentRequired: data.equipmentRequired,
      difficulty: data.difficulty,
      category: data.category,
      exerciseType: data.exerciseType ?? 'WEIGHTED',
      isCompound: data.isCompound ?? false,
      instructions: data.instructions,
      demoVideoUrl: data.demoVideoUrl,
      demoGifUrl: data.demoGifUrl,
    },
  });

  await auditLog({
    action: 'EXERCISE_CREATED',
    actorId,
    subjectType: 'Exercise',
    subjectId: exercise.id,
    branchId,
    newValue: { name: exercise.name, category: exercise.category },
  });

  return exercise;
}

/**
 * Update an exercise
 */
export async function updateExercise({
  exerciseId,
  actorId,
  branchId,
  ...data
}: UpdateExerciseInput) {
  const existing = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (!existing) {
    throw new AppError('EXERCISE_NOT_FOUND', 'Exercise not found', 404);
  }

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.targetMuscleGroup !== undefined) updateData.targetMuscleGroup = data.targetMuscleGroup;
  if (data.secondaryMuscles !== undefined) updateData.secondaryMuscles = data.secondaryMuscles;
  if (data.equipmentRequired !== undefined) updateData.equipmentRequired = data.equipmentRequired;
  if (data.difficulty !== undefined) updateData.difficulty = data.difficulty;
  if (data.category !== undefined) updateData.category = data.category;
  if (data.exerciseType !== undefined) updateData.exerciseType = data.exerciseType;
  if (data.isCompound !== undefined) updateData.isCompound = data.isCompound;
  if (data.instructions !== undefined) updateData.instructions = data.instructions;
  if (data.demoVideoUrl !== undefined) updateData.demoVideoUrl = data.demoVideoUrl;
  if (data.demoGifUrl !== undefined) updateData.demoGifUrl = data.demoGifUrl;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  const updated = await prisma.exercise.update({
    where: { id: exerciseId },
    data: updateData,
  });

  await auditLog({
    action: 'EXERCISE_UPDATED',
    actorId,
    subjectType: 'Exercise',
    subjectId: exerciseId,
    branchId,
    oldValue: { name: existing.name, category: existing.category },
    newValue: updateData as Record<string, string | number | boolean | null>,
  });

  return updated;
}

/**
 * Get a single exercise by ID
 */
export async function getExerciseById(exerciseId: string) {
  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (!exercise) {
    throw new AppError('EXERCISE_NOT_FOUND', 'Exercise not found', 404);
  }
  return exercise;
}

/**
 * List exercises with search, filter, and pagination
 */
export async function listExercises({
  search,
  muscleGroup,
  category,
  page,
  pageSize,
}: ListExercisesInput) {
  const where: Record<string, unknown> = { isActive: true };

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { targetMuscleGroup: { contains: search, mode: 'insensitive' } },
      { equipmentRequired: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (muscleGroup) {
    where.targetMuscleGroup = { contains: muscleGroup, mode: 'insensitive' };
  }

  if (category) {
    where.category = category;
  }

  const [exercises, total] = await Promise.all([
    prisma.exercise.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.exercise.count({ where }),
  ]);

  return {
    data: exercises,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Soft-delete an exercise
 */
export async function deleteExercise(exerciseId: string, actorId: string, branchId: string) {
  const existing = await prisma.exercise.findUnique({ where: { id: exerciseId } });
  if (!existing) {
    throw new AppError('EXERCISE_NOT_FOUND', 'Exercise not found', 404);
  }

  await prisma.exercise.update({
    where: { id: exerciseId },
    data: { isActive: false },
  });

  await auditLog({
    action: 'EXERCISE_DELETED',
    actorId,
    subjectType: 'Exercise',
    subjectId: exerciseId,
    branchId,
    oldValue: { name: existing.name, isActive: true },
    newValue: { isActive: false },
  });

  return { success: true };
}

/**
 * Bulk import exercises
 */
export async function bulkImportExercises({ exercises, actorId, branchId }: BulkImportInput) {
  const created: string[] = [];
  const errors: { index: number; name: string; error: string }[] = [];

  for (let i = 0; i < exercises.length; i++) {
    const ex = exercises[i]!;
    try {
      const result = await prisma.exercise.create({
        data: {
          name: ex.name,
          targetMuscleGroup: ex.targetMuscleGroup,
          secondaryMuscles: ex.secondaryMuscles ?? [],
          equipmentRequired: ex.equipmentRequired,
          difficulty: ex.difficulty,
          category: ex.category,
          exerciseType: ex.exerciseType ?? 'WEIGHTED',
          instructions: ex.instructions,
          demoVideoUrl: ex.demoVideoUrl,
          demoGifUrl: ex.demoGifUrl,
        },
      });
      created.push(result.id);
    } catch (err) {
      errors.push({
        index: i,
        name: ex.name,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  if (created.length > 0) {
    await auditLog({
      action: 'EXERCISES_BULK_IMPORTED',
      actorId,
      subjectType: 'Exercise',
      subjectId: 'bulk',
      branchId,
      newValue: { count: created.length, ids: created },
    });
  }

  return { created: created.length, errors };
}
