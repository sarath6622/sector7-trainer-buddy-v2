import { prisma } from '@/lib/prisma';
import { AppError } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { expandCuratedGroups } from '@/lib/muscle-groups';
import { searchExerciseCatalog } from '@/lib/exerciseSearch';
import type {
  ExerciseCategory,
  DifficultyLevel,
  ExerciseType,
  SecondaryMetric,
} from '@prisma/client';

interface CreateExerciseInput {
  name: string;
  targetMuscleGroup: string;
  secondaryMuscles?: string[];
  equipmentRequired?: string;
  difficulty?: DifficultyLevel;
  category: ExerciseCategory;
  exerciseType?: ExerciseType;
  secondaryMetric?: SecondaryMetric;
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
  secondaryMetric?: SecondaryMetric;
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
  /** Curated group IDs (comma-separated upstream). Expanded server-side into
   *  the union of catalog `targetMuscleGroup` values via `expandCuratedGroups`
   *  and matched with `IN (...)` — preferred over `muscleGroup` substring
   *  match because it covers aliases like Lats / Lower Back under "back". */
  muscleGroups?: string;
  category?: ExerciseCategory;
  exerciseType?: ExerciseType;
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
    secondaryMetric?: SecondaryMetric;
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
      secondaryMetric: data.secondaryMetric ?? 'KM',
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
  if (data.secondaryMetric !== undefined) updateData.secondaryMetric = data.secondaryMetric;
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

/** Upper bound on rows pulled in for in-memory search scoring. The exercise
 *  library is a curated catalog in the low hundreds; this is a guard rail, not
 *  an expected limit. */
const MAX_SEARCH_CANDIDATES = 1000;

/**
 * List exercises with search, filter, and pagination
 */
export async function listExercises({
  search,
  muscleGroup,
  muscleGroups,
  category,
  exerciseType,
  page,
  pageSize,
}: ListExercisesInput) {
  const where: Record<string, unknown> = { isActive: true };

  // Prefer the curated-groups expansion when provided — it pulls in aliases
  // (e.g. "back" → Back, Lats, Lower Back) that the old substring match on
  // `muscleGroup` would miss.
  const expandedGroups = muscleGroups
    ? expandCuratedGroups(
        muscleGroups
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : [];
  if (expandedGroups.length > 0) {
    where.targetMuscleGroup = { in: expandedGroups };
  } else if (muscleGroup) {
    where.targetMuscleGroup = { contains: muscleGroup, mode: 'insensitive' };
  }

  if (category) {
    where.category = category;
  }

  if (exerciseType) {
    where.exerciseType = exerciseType;
  }

  // Free-text search is ranked in memory instead of matched in SQL: trainers
  // type "incline press" for "Incline Chest Press (Machine)", and no `contains`
  // predicate finds that. `searchExerciseCatalog` scores the filtered catalog
  // (a few hundred curated rows) and falls back to near misses when nothing
  // matches strictly, so the picker is never a dead end.
  if (search && search.trim().length > 0) {
    const candidates = await prisma.exercise.findMany({
      where,
      orderBy: { name: 'asc' },
      take: MAX_SEARCH_CANDIDATES,
    });
    const { matches, relaxed } = searchExerciseCatalog(search, candidates);
    const start = (page - 1) * pageSize;

    return {
      data: matches.slice(start, start + pageSize),
      pagination: {
        page,
        pageSize,
        total: matches.length,
        totalPages: Math.ceil(matches.length / pageSize),
      },
      relaxed,
    };
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
    relaxed: false,
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
          secondaryMetric: ex.secondaryMetric ?? 'KM',
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
