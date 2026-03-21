import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWorkoutLogCreate = vi.fn();

vi.mock('@/lib/prisma', () => {
  const workoutLogCreate = (...args: unknown[]) => mockWorkoutLogCreate(...args);
  return {
    prisma: {
      sessionInstance: {
        findFirst: vi.fn(),
      },
      exercise: {
        findMany: vi.fn(),
      },
      workoutLog: {
        create: workoutLogCreate,
        findUnique: vi.fn(),
        findMany: vi.fn(),
        delete: vi.fn(),
      },
      workoutSet: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => {
        // Interactive transaction: call the function with a tx proxy that uses the same mocks
        return fn({
          workoutLog: { create: workoutLogCreate },
        });
      }),
    },
  };
});

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import * as workoutService from '@/services/workout.service';

const BRANCH = 'branch-1';
const ACTOR = 'actor-1';
const TRAINER = 'tp-1';

beforeEach(() => vi.clearAllMocks());

// ─── createWorkoutLogs ─────────────────────────────

describe('createWorkoutLogs', () => {
  const input = {
    sessionInstanceId: 'sess-1',
    exercises: [
      {
        exerciseId: 'ex-1',
        orderIndex: 0,
        sets: [
          { setNumber: 1, reps: 10, weightKg: 60 },
          { setNumber: 2, reps: 8, weightKg: 70 },
        ],
      },
    ],
    trainerProfileId: TRAINER,
    actorId: ACTOR,
    branchId: BRANCH,
  };

  it('should throw if session not found', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(workoutService.createWorkoutLogs(input)).rejects.toThrow('Session not found');
  });

  it('should throw if session is not IN_PROGRESS or COMPLETED', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-1',
      status: 'SCHEDULED',
      branchId: BRANCH,
      trainerProfileId: TRAINER,
    });
    await expect(workoutService.createWorkoutLogs(input)).rejects.toThrow(
      'Can only log workouts for active or completed sessions',
    );
  });

  it('should throw if exercises not found', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-1',
      status: 'IN_PROGRESS',
      branchId: BRANCH,
      trainerProfileId: TRAINER,
    });
    (prisma.exercise.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await expect(workoutService.createWorkoutLogs(input)).rejects.toThrow('Exercises not found');
  });

  it('should create workout logs in transaction and audit', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-1',
      status: 'IN_PROGRESS',
      branchId: BRANCH,
      trainerProfileId: TRAINER,
    });
    (prisma.exercise.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'ex-1' }]);

    const mockLog = {
      id: 'wl-1',
      exerciseId: 'ex-1',
      orderIndex: 0,
      exercise: {
        id: 'ex-1',
        name: 'Bench Press',
        targetMuscleGroup: 'Chest',
        category: 'HYPERTROPHY',
      },
      sets: [
        { setNumber: 1, reps: 10, weightKg: 60 },
        { setNumber: 2, reps: 8, weightKg: 70 },
      ],
    };
    mockWorkoutLogCreate.mockResolvedValue(mockLog);

    const result = await workoutService.createWorkoutLogs(input);

    expect(result).toHaveLength(1);
    expect(result[0].exerciseId).toBe('ex-1');
    expect(mockWorkoutLogCreate).toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WORKOUT_LOGGED',
        subjectId: 'sess-1',
        branchId: BRANCH,
      }),
    );
  });
});

// ─── updateWorkoutLog ──────────────────────────────

describe('updateWorkoutLog', () => {
  it('should throw if workout log not found', async () => {
    (prisma.workoutLog.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      workoutService.updateWorkoutLog({
        workoutLogId: 'wl-1',
        sets: [{ setNumber: 1, reps: 12, weightKg: 80 }],
        trainerProfileId: TRAINER,
        actorId: ACTOR,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Workout log not found');
  });

  it('should throw if wrong branch', async () => {
    (prisma.workoutLog.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'wl-1',
      sessionInstance: { branchId: 'other-branch', trainerProfileId: TRAINER },
      sets: [],
    });
    await expect(
      workoutService.updateWorkoutLog({
        workoutLogId: 'wl-1',
        sets: [{ setNumber: 1, reps: 12 }],
        trainerProfileId: TRAINER,
        actorId: ACTOR,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Access denied');
  });

  it('should throw if not trainer session', async () => {
    (prisma.workoutLog.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'wl-1',
      sessionInstance: { branchId: BRANCH, trainerProfileId: 'other-trainer' },
      sets: [],
    });
    await expect(
      workoutService.updateWorkoutLog({
        workoutLogId: 'wl-1',
        sets: [{ setNumber: 1, reps: 12 }],
        trainerProfileId: TRAINER,
        actorId: ACTOR,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Not your session');
  });

  it('should replace sets and audit', async () => {
    (prisma.workoutLog.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        id: 'wl-1',
        sessionInstance: { branchId: BRANCH, trainerProfileId: TRAINER },
        sets: [{ setNumber: 1, reps: 10 }],
      })
      .mockResolvedValueOnce({
        id: 'wl-1',
        exercise: {
          id: 'ex-1',
          name: 'Squat',
          targetMuscleGroup: 'Quadriceps',
          category: 'STRENGTH',
        },
        sets: [{ setNumber: 1, reps: 12, weightKg: 80 }],
      });

    (prisma.workoutSet.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (prisma.workoutSet.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    const result = await workoutService.updateWorkoutLog({
      workoutLogId: 'wl-1',
      sets: [{ setNumber: 1, reps: 12, weightKg: 80 }],
      trainerProfileId: TRAINER,
      actorId: ACTOR,
      branchId: BRANCH,
    });

    expect(result!.sets[0].reps).toBe(12);
    expect(prisma.workoutSet.deleteMany).toHaveBeenCalledWith({ where: { workoutLogId: 'wl-1' } });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'WORKOUT_UPDATED' }));
  });
});

// ─── getSessionWorkouts ────────────────────────────

describe('getSessionWorkouts', () => {
  it('should throw if session not found', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(
      workoutService.getSessionWorkouts({ sessionInstanceId: 'sess-1', branchId: BRANCH }),
    ).rejects.toThrow('Session not found');
  });

  it('should return workout logs for session', async () => {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-1',
      branchId: BRANCH,
    });
    (prisma.workoutLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'wl-1',
        exercise: { id: 'ex-1', name: 'Bench Press' },
        sets: [{ setNumber: 1, reps: 10, weightKg: 60 }],
      },
    ]);

    const result = await workoutService.getSessionWorkouts({
      sessionInstanceId: 'sess-1',
      branchId: BRANCH,
    });

    expect(result).toHaveLength(1);
    expect(result[0].exercise.name).toBe('Bench Press');
  });
});
