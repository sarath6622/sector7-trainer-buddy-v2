import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockWorkoutLogCreate = vi.fn();

vi.mock('@/lib/prisma', () => {
  const workoutLogCreate = (...args: unknown[]) => mockWorkoutLogCreate(...args);
  const workoutLogFindUnique = vi.fn();
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
        findUnique: workoutLogFindUnique,
        findMany: vi.fn(),
        delete: vi.fn(),
      },
      workoutSet: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _max: { weightKg: null } }),
      },
      communityPost: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        // tx proxy mirrors the upsert path: findMany returns no existing logs,
        // create returns the new log, findUnique returns the same.
        return fn({
          workoutLog: {
            findMany: vi.fn().mockResolvedValue([]),
            deleteMany: vi.fn().mockResolvedValue({}),
            create: workoutLogCreate,
            update: vi.fn(),
            findUnique: workoutLogFindUnique,
          },
          workoutSet: { deleteMany: vi.fn().mockResolvedValue({}) },
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
    actorUserId: ACTOR,
    actorTrainerProfileId: TRAINER,
    actorClientProfileId: null,
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
      clientProfileId: 'client-1',
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
    // The upsert path re-reads the final shape via findUnique after create —
    // wire both mocks so the tx returns the same row to the caller.
    (prisma.workoutLog.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockLog);

    const result = await workoutService.createWorkoutLogs(input);

    expect(result.workoutLogs).toHaveLength(1);
    expect(result.workoutLogs[0]!.exerciseId).toBe('ex-1');
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

// ─── createWorkoutLogs — scoped merge (ADR-036 concurrency) ──────────────────
//
// The shared trainer↔client write path used to replace the session's entire log
// set on every POST, so a debounced save from a device holding a stale snapshot
// silently deleted a row the peer had just logged. The diff fields
// (dirtyExerciseIds / removedExerciseIds) scope the write to what THIS device
// changed; everything else is left untouched.

describe('createWorkoutLogs — scoped merge', () => {
  function wireSession() {
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-1',
      status: 'IN_PROGRESS',
      branchId: BRANCH,
      trainerProfileId: TRAINER,
      clientProfileId: 'client-1',
    });
  }

  it('leaves a peer exercise (absent from the diff) untouched instead of deleting it', async () => {
    wireSession();
    (prisma.exercise.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'ex-a' },
      { id: 'ex-peer' },
    ]);

    // Server already holds the trainer's ex-a and a set the client just added
    // under ex-peer. The trainer saves a stale snapshot of both but only ex-a
    // is dirty.
    const existingLogs = [
      {
        id: 'wl-a',
        exerciseId: 'ex-a',
        orderIndex: 0,
        sets: [{ id: 's-a', setNumber: 1, reps: 10, weightKg: 60 }],
      },
      {
        id: 'wl-peer',
        exerciseId: 'ex-peer',
        orderIndex: 1,
        sets: [{ id: 's-p', setNumber: 1, reps: 12, weightKg: 40 }],
      },
    ];
    const deleteLogs = vi.fn().mockResolvedValue({});
    const findUnique = vi.fn().mockResolvedValue({
      id: 'wl-a',
      exercise: {
        id: 'ex-a',
        name: 'Bench',
        targetMuscleGroup: 'Chest',
        category: 'X',
        exerciseType: 'WEIGHTED',
      },
      sets: [],
    });
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          workoutLog: {
            findMany: vi.fn().mockResolvedValue(existingLogs),
            deleteMany: deleteLogs,
            create: vi.fn(),
            update: vi.fn().mockResolvedValue({}),
            findUnique,
          },
          workoutSet: {
            deleteMany: vi.fn().mockResolvedValue({}),
            update: vi.fn(),
            create: vi.fn(),
          },
        }),
    );

    await workoutService.createWorkoutLogs({
      sessionInstanceId: 'sess-1',
      exercises: [
        { exerciseId: 'ex-a', orderIndex: 0, sets: [{ setNumber: 1, reps: 10, weightKg: 80 }] },
        { exerciseId: 'ex-peer', orderIndex: 1, sets: [{ setNumber: 1, reps: 12, weightKg: 40 }] },
      ],
      dirtyExerciseIds: ['ex-a'],
      removedExerciseIds: [],
      actorUserId: ACTOR,
      actorTrainerProfileId: TRAINER,
      actorClientProfileId: null,
      branchId: BRANCH,
    });

    // The peer's log is never deleted, and only the dirty exercise is reconciled.
    expect(deleteLogs).not.toHaveBeenCalled();
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'wl-a' } }));
    expect(findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'wl-peer' } }),
    );
  });

  it('deletes exactly the exercises named in removedExerciseIds', async () => {
    wireSession();
    (prisma.exercise.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'ex-a' }]);
    const existingLogs = [
      { id: 'wl-a', exerciseId: 'ex-a', orderIndex: 0, sets: [] },
      { id: 'wl-gone', exerciseId: 'ex-gone', orderIndex: 1, sets: [{ id: 's-g', setNumber: 1 }] },
    ];
    const deleteLogs = vi.fn().mockResolvedValue({});
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          workoutLog: {
            findMany: vi.fn().mockResolvedValue(existingLogs),
            deleteMany: deleteLogs,
            create: vi.fn(),
            update: vi.fn().mockResolvedValue({}),
            findUnique: vi.fn().mockResolvedValue({
              id: 'wl-a',
              exercise: {
                id: 'ex-a',
                name: 'Bench',
                targetMuscleGroup: 'Chest',
                category: 'X',
                exerciseType: 'WEIGHTED',
              },
              sets: [],
            }),
          },
          workoutSet: {
            deleteMany: vi.fn().mockResolvedValue({}),
            update: vi.fn(),
            create: vi.fn(),
          },
        }),
    );

    await workoutService.createWorkoutLogs({
      sessionInstanceId: 'sess-1',
      exercises: [{ exerciseId: 'ex-a', orderIndex: 0, sets: [] }],
      dirtyExerciseIds: [],
      removedExerciseIds: ['ex-gone'],
      actorUserId: ACTOR,
      actorTrainerProfileId: TRAINER,
      actorClientProfileId: null,
      branchId: BRANCH,
    });

    // Only wl-gone is dropped (the explicit removal), via the log deleteMany.
    expect(deleteLogs).toHaveBeenCalledWith({ where: { id: { in: ['wl-gone'] } } });
  });

  it('legacy mode (no diff supplied) still deletes exercises absent from the snapshot', async () => {
    wireSession();
    (prisma.exercise.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'ex-a' }]);
    const existingLogs = [
      { id: 'wl-a', exerciseId: 'ex-a', orderIndex: 0, sets: [] },
      { id: 'wl-old', exerciseId: 'ex-old', orderIndex: 1, sets: [{ id: 's-o', setNumber: 1 }] },
    ];
    const deleteLogs = vi.fn().mockResolvedValue({});
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          workoutLog: {
            findMany: vi.fn().mockResolvedValue(existingLogs),
            deleteMany: deleteLogs,
            create: vi.fn().mockResolvedValue({ id: 'wl-a' }),
            update: vi.fn().mockResolvedValue({}),
            findUnique: vi.fn().mockResolvedValue({
              id: 'wl-a',
              exercise: {
                id: 'ex-a',
                name: 'Bench',
                targetMuscleGroup: 'Chest',
                category: 'X',
                exerciseType: 'WEIGHTED',
              },
              sets: [],
            }),
          },
          workoutSet: {
            deleteMany: vi.fn().mockResolvedValue({}),
            update: vi.fn(),
            create: vi.fn(),
          },
        }),
    );

    await workoutService.createWorkoutLogs({
      sessionInstanceId: 'sess-1',
      exercises: [{ exerciseId: 'ex-a', orderIndex: 0, sets: [] }],
      // no dirtyExerciseIds / removedExerciseIds → legacy full-replace
      actorUserId: ACTOR,
      actorTrainerProfileId: TRAINER,
      actorClientProfileId: null,
      branchId: BRANCH,
    });

    expect(deleteLogs).toHaveBeenCalledWith({ where: { id: { in: ['wl-old'] } } });
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
        actorUserId: ACTOR,
        actorTrainerProfileId: TRAINER,
        actorClientProfileId: null,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Workout log not found');
  });

  it('should throw if wrong branch', async () => {
    (prisma.workoutLog.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'wl-1',
      sessionInstance: { id: 'sess-1', branchId: 'other-branch' },
      sets: [],
    });
    await expect(
      workoutService.updateWorkoutLog({
        workoutLogId: 'wl-1',
        sets: [{ setNumber: 1, reps: 12 }],
        actorUserId: ACTOR,
        actorTrainerProfileId: TRAINER,
        actorClientProfileId: null,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Access denied');
  });

  it('should throw if neither trainer nor client of session', async () => {
    (prisma.workoutLog.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'wl-1',
      sessionInstance: { id: 'sess-1', branchId: BRANCH },
      sets: [],
    });
    // assertSessionAccess will look up the session row and reject because the
    // session belongs to a different trainer / client.
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-1',
      branchId: BRANCH,
      trainerProfileId: 'other-trainer',
      clientProfileId: 'other-client',
      status: 'IN_PROGRESS',
    });
    await expect(
      workoutService.updateWorkoutLog({
        workoutLogId: 'wl-1',
        sets: [{ setNumber: 1, reps: 12 }],
        actorUserId: ACTOR,
        actorTrainerProfileId: TRAINER,
        actorClientProfileId: null,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Not allowed to access this session');
  });

  it('should replace sets and audit', async () => {
    (prisma.workoutLog.findUnique as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        id: 'wl-1',
        sessionInstance: { id: 'sess-1', branchId: BRANCH },
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
    (prisma.sessionInstance.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'sess-1',
      branchId: BRANCH,
      trainerProfileId: TRAINER,
      clientProfileId: null,
      status: 'IN_PROGRESS',
    });

    (prisma.workoutSet.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (prisma.workoutSet.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

    const result = await workoutService.updateWorkoutLog({
      workoutLogId: 'wl-1',
      sets: [{ setNumber: 1, reps: 12, weightKg: 80 }],
      actorUserId: ACTOR,
      actorTrainerProfileId: TRAINER,
      actorClientProfileId: null,
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
