import { describe, it, expect, vi, beforeEach } from 'vitest';

// Verifies the ADR-037 isCompleted semantics on createWorkoutLogs:
//   - new log: `isCompleted: true` persists isCompleted=true and stamps completedAt.
//   - new log: omitted field defaults to isCompleted=false, completedAt=null.
//   - existing log + payload omits isCompleted: existing flag is preserved
//     (this is the auto-save case — every keystroke shouldn't clobber the
//     completion state).
//   - existing log + payload sets isCompleted=false: row is unmarked and
//     completedAt cleared to null.

const mockTransaction = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    sessionInstance: { findFirst: vi.fn() },
    exercise: { findMany: vi.fn(), findUnique: vi.fn() },
    workoutSet: { aggregate: vi.fn() },
    workoutLog: {},
    communityPost: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/services/badge.service', () => ({
  evaluatePRBadges: vi.fn().mockResolvedValue([]),
  evaluateWeightLiftedBadges: vi.fn().mockResolvedValue([]),
  evaluateExerciseMilestoneBadges: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/services/community.service', () => ({ createPost: vi.fn() }));

import { prisma } from '@/lib/prisma';
import * as workout from '@/services/workout.service';

const BRANCH = 'branch-1';
const ACTOR = 'user-1';
const SESSION_ID = 'sess-1';
const TRAINER_ID = 'trainer-1';
const CLIENT_ID = 'client-1';
type Mock = ReturnType<typeof vi.fn>;

interface CapturedTxCalls {
  create: Mock;
  update: Mock;
}

function setupTxMock(opts: {
  existingLogs?: Array<{
    id: string;
    exerciseId: string;
    orderIndex: number;
    isCompleted: boolean;
    sets: Array<{ id: string; setNumber: number; weightKg?: number | null }>;
  }>;
}): CapturedTxCalls {
  const create = vi.fn().mockImplementation(async ({ data }: { data: { exerciseId: string } }) => ({
    id: `log-${data.exerciseId}`,
    exerciseId: data.exerciseId,
    exercise: { id: data.exerciseId, name: 'X' },
    sets: [],
  }));
  const update = vi.fn().mockResolvedValue({});
  const findUnique = vi.fn().mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    exerciseId: where.id.replace(/^log-/, ''),
    exercise: { id: where.id.replace(/^log-/, ''), name: 'X' },
    sets: [],
  }));

  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    return fn({
      workoutLog: {
        findMany: vi.fn().mockResolvedValue(opts.existingLogs ?? []),
        deleteMany: vi.fn().mockResolvedValue({}),
        create,
        update,
        findUnique,
      },
      workoutSet: {
        deleteMany: vi.fn().mockResolvedValue({}),
        update: vi.fn(),
        create: vi.fn(),
      },
    });
  });

  return { create, update };
}

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.sessionInstance.findFirst as Mock).mockResolvedValue({
    id: SESSION_ID,
    branchId: BRANCH,
    trainerProfileId: TRAINER_ID,
    clientProfileId: CLIENT_ID,
    status: 'IN_PROGRESS',
    scheduledDate: new Date(),
    startedAt: new Date(),
  });
  (prisma.exercise.findMany as Mock).mockResolvedValue([{ id: 'ex-bench' }]);
  (prisma.exercise.findUnique as Mock).mockResolvedValue({ isCompound: false });
  (prisma.workoutSet.aggregate as Mock).mockResolvedValue({ _max: { weightKg: null } });
});

const benchEntry = {
  exerciseId: 'ex-bench',
  orderIndex: 0,
  sets: [{ setNumber: 1, weightKg: 60, reps: 10 }],
};

describe('createWorkoutLogs — isCompleted persistence (ADR-037)', () => {
  it('new log with isCompleted:true stamps completedAt', async () => {
    const tx = setupTxMock({ existingLogs: [] });
    await workout.createWorkoutLogs({
      sessionInstanceId: SESSION_ID,
      exercises: [{ ...benchEntry, isCompleted: true }],
      actorUserId: ACTOR,
      actorTrainerProfileId: TRAINER_ID,
      actorClientProfileId: null,
      branchId: BRANCH,
    });
    expect(tx.create).toHaveBeenCalledTimes(1);
    const createCall = tx.create.mock.calls[0]![0] as {
      data: { isCompleted: boolean; completedAt: Date | null };
    };
    expect(createCall.data.isCompleted).toBe(true);
    expect(createCall.data.completedAt).toBeInstanceOf(Date);
  });

  it('new log with isCompleted omitted defaults to false + null completedAt', async () => {
    const tx = setupTxMock({ existingLogs: [] });
    await workout.createWorkoutLogs({
      sessionInstanceId: SESSION_ID,
      exercises: [benchEntry],
      actorUserId: ACTOR,
      actorTrainerProfileId: TRAINER_ID,
      actorClientProfileId: null,
      branchId: BRANCH,
    });
    const createCall = tx.create.mock.calls[0]![0] as {
      data: { isCompleted: boolean; completedAt: Date | null };
    };
    expect(createCall.data.isCompleted).toBe(false);
    expect(createCall.data.completedAt).toBeNull();
  });

  it('existing completed log + payload omits isCompleted: flag is preserved (no update touches it)', async () => {
    // The exact scenario the auto-save guard protects against: every
    // keystroke on a non-completion field shouldn't clobber the completion
    // state. The service should issue NO workoutLog.update for isCompleted.
    const tx = setupTxMock({
      existingLogs: [
        {
          id: 'log-ex-bench',
          exerciseId: 'ex-bench',
          orderIndex: 0,
          isCompleted: true,
          sets: [{ id: 'set-1', setNumber: 1, weightKg: 60 }],
        },
      ],
    });
    await workout.createWorkoutLogs({
      sessionInstanceId: SESSION_ID,
      exercises: [benchEntry], // no isCompleted field
      actorUserId: ACTOR,
      actorTrainerProfileId: TRAINER_ID,
      actorClientProfileId: null,
      branchId: BRANCH,
    });
    // orderIndex matches, no isCompleted in payload → no update call at all.
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('existing completed log + payload sets isCompleted:false: clears flag and completedAt', async () => {
    const tx = setupTxMock({
      existingLogs: [
        {
          id: 'log-ex-bench',
          exerciseId: 'ex-bench',
          orderIndex: 0,
          isCompleted: true,
          sets: [{ id: 'set-1', setNumber: 1, weightKg: 60 }],
        },
      ],
    });
    await workout.createWorkoutLogs({
      sessionInstanceId: SESSION_ID,
      exercises: [{ ...benchEntry, isCompleted: false }],
      actorUserId: ACTOR,
      actorTrainerProfileId: TRAINER_ID,
      actorClientProfileId: null,
      branchId: BRANCH,
    });
    expect(tx.update).toHaveBeenCalledTimes(1);
    const updateCall = tx.update.mock.calls[0]![0] as {
      data: { isCompleted?: boolean; completedAt?: Date | null };
    };
    expect(updateCall.data.isCompleted).toBe(false);
    expect(updateCall.data.completedAt).toBeNull();
  });
});
