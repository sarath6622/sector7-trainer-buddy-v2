import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    exercise: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import * as exerciseService from '@/services/exercise.service';

const BRANCH = 'branch-1';
const ACTOR = 'actor-1';

beforeEach(() => vi.clearAllMocks());

// ─── createExercise ─────────────────────────────────

describe('createExercise', () => {
  it('should create an exercise and write audit log', async () => {
    const mockExercise = {
      id: 'ex-1',
      name: 'Bench Press',
      targetMuscleGroup: 'Chest',
      category: 'HYPERTROPHY',
      secondaryMuscles: ['Triceps'],
      equipmentRequired: 'Barbell',
      difficulty: null,
      instructions: null,
      demoVideoUrl: null,
      demoGifUrl: null,
      isActive: true,
    };

    (prisma.exercise.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockExercise);

    const result = await exerciseService.createExercise({
      name: 'Bench Press',
      targetMuscleGroup: 'Chest',
      category: 'HYPERTROPHY',
      secondaryMuscles: ['Triceps'],
      equipmentRequired: 'Barbell',
      actorId: ACTOR,
      branchId: BRANCH,
    });

    expect(result.id).toBe('ex-1');
    expect(prisma.exercise.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Bench Press', category: 'HYPERTROPHY' }),
      }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EXERCISE_CREATED',
        actorId: ACTOR,
        branchId: BRANCH,
      }),
    );
  });
});

// ─── updateExercise ─────────────────────────────────

describe('updateExercise', () => {
  it('should throw if exercise not found', async () => {
    (prisma.exercise.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      exerciseService.updateExercise({
        exerciseId: 'ex-1',
        name: 'Updated',
        actorId: ACTOR,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Exercise not found');
  });

  it('should update exercise and audit', async () => {
    (prisma.exercise.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ex-1',
      name: 'Old Name',
      category: 'STRENGTH',
    });
    (prisma.exercise.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ex-1',
      name: 'New Name',
      category: 'STRENGTH',
    });

    const result = await exerciseService.updateExercise({
      exerciseId: 'ex-1',
      name: 'New Name',
      actorId: ACTOR,
      branchId: BRANCH,
    });

    expect(result.name).toBe('New Name');
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'EXERCISE_UPDATED' }));
  });
});

// ─── getExerciseById ────────────────────────────────

describe('getExerciseById', () => {
  it('should throw if not found', async () => {
    (prisma.exercise.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(exerciseService.getExerciseById('ex-1')).rejects.toThrow('Exercise not found');
  });

  it('should return exercise', async () => {
    const mockEx = { id: 'ex-1', name: 'Squat' };
    (prisma.exercise.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockEx);
    const result = await exerciseService.getExerciseById('ex-1');
    expect(result.name).toBe('Squat');
  });
});

// ─── listExercises ──────────────────────────────────

describe('listExercises', () => {
  it('should return paginated results', async () => {
    const mockExercises = [
      { id: 'ex-1', name: 'Squat' },
      { id: 'ex-2', name: 'Deadlift' },
    ];
    (prisma.exercise.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockExercises);
    (prisma.exercise.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);

    const result = await exerciseService.listExercises({
      page: 1,
      pageSize: 20,
    });

    expect(result.data).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
    expect(result.pagination.totalPages).toBe(1);
  });

  it('should apply search filter', async () => {
    (prisma.exercise.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.exercise.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    await exerciseService.listExercises({
      search: 'bench',
      page: 1,
      pageSize: 20,
    });

    expect(prisma.exercise.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isActive: true,
          OR: expect.arrayContaining([
            expect.objectContaining({ name: { contains: 'bench', mode: 'insensitive' } }),
          ]),
        }),
      }),
    );
  });
});

// ─── deleteExercise ─────────────────────────────────

describe('deleteExercise', () => {
  it('should throw if not found', async () => {
    (prisma.exercise.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(exerciseService.deleteExercise('ex-1', ACTOR, BRANCH)).rejects.toThrow(
      'Exercise not found',
    );
  });

  it('should soft-delete and audit', async () => {
    (prisma.exercise.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ex-1',
      name: 'Squat',
      isActive: true,
    });
    (prisma.exercise.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'ex-1',
      isActive: false,
    });

    const result = await exerciseService.deleteExercise('ex-1', ACTOR, BRANCH);
    expect(result.success).toBe(true);
    expect(prisma.exercise.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isActive: false },
      }),
    );
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'EXERCISE_DELETED' }));
  });
});
