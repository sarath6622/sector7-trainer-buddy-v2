import { describe, it, expect, vi, beforeEach } from 'vitest';

// Verifies the ADR-052 per-exercise trainer note on createWorkoutLogs. The
// contract mirrors isCompleted (ADR-037) — an omitted field means "leave what's
// stored alone" — with one addition: '' is a real value that means "cleared",
// and it is normalized to NULL so "no note" has a single representation.
//
//   - new log, note supplied        → stored as given
//   - new log, note omitted         → NULL
//   - new log, note is whitespace   → NULL (not '  ')
//   - existing log, note omitted    → preserved, no update issued
//                                     (the auto-save / client-writer case)
//   - existing log, note changed    → updated
//   - existing log, same note       → no update issued (no updatedAt churn)
//   - existing log, note cleared    → NULL

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

function setupTxMock(opts: {
  existingLogs?: Array<{
    id: string;
    exerciseId: string;
    orderIndex: number;
    isCompleted: boolean;
    notes: string | null;
    sets: Array<{ id: string; setNumber: number; weightKg?: number | null }>;
  }>;
}) {
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

/** An already-persisted bench log, optionally carrying a note. */
const existingBench = (notes: string | null) => [
  {
    id: 'log-ex-bench',
    exerciseId: 'ex-bench',
    orderIndex: 0,
    isCompleted: false,
    notes,
    sets: [{ id: 'set-1', setNumber: 1, weightKg: 60 }],
  },
];

async function save(exercises: Parameters<typeof workout.createWorkoutLogs>[0]['exercises']) {
  await workout.createWorkoutLogs({
    sessionInstanceId: SESSION_ID,
    exercises,
    actorUserId: ACTOR,
    actorTrainerProfileId: TRAINER_ID,
    actorClientProfileId: null,
    branchId: BRANCH,
  });
}

describe('createWorkoutLogs — per-exercise trainer note (ADR-052)', () => {
  it('stores the note on a brand-new log', async () => {
    const tx = setupTxMock({ existingLogs: [] });
    await save([{ ...benchEntry, notes: 'went light — shoulder niggle' }]);

    const createCall = tx.create.mock.calls[0]![0] as { data: { notes: string | null } };
    expect(createCall.data.notes).toBe('went light — shoulder niggle');
  });

  it('writes NULL on a new log when no note was supplied', async () => {
    const tx = setupTxMock({ existingLogs: [] });
    await save([benchEntry]);

    const createCall = tx.create.mock.calls[0]![0] as { data: { notes: string | null } };
    expect(createCall.data.notes).toBeNull();
  });

  it('normalizes a whitespace-only note to NULL', async () => {
    // Otherwise the header "Note" chip would light up for a note containing
    // nothing but spaces, and the UI could never clear it.
    const tx = setupTxMock({ existingLogs: [] });
    await save([{ ...benchEntry, notes: '   \n  ' }]);

    const createCall = tx.create.mock.calls[0]![0] as { data: { notes: string | null } };
    expect(createCall.data.notes).toBeNull();
  });

  it('preserves the stored note when the payload omits it', async () => {
    // The critical case: the client's own session page has no notes UI, so its
    // autosave omits the key. That save must not wipe the trainer's note. Same
    // guarantee covers offline-sync bundles and /api/trainer/workouts.
    const tx = setupTxMock({ existingLogs: existingBench('ate badly, low energy') });
    await save([benchEntry]); // no `notes` key

    // orderIndex matches and nothing else changed → no update issued at all.
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('updates the note when it changed', async () => {
    const tx = setupTxMock({ existingLogs: existingBench('old note') });
    await save([{ ...benchEntry, notes: 'new note' }]);

    expect(tx.update).toHaveBeenCalledTimes(1);
    const updateCall = tx.update.mock.calls[0]![0] as { data: { notes?: string | null } };
    expect(updateCall.data.notes).toBe('new note');
  });

  it('issues no update when the note is unchanged', async () => {
    // Auto-save fires every ~5s while the trainer types elsewhere in the card;
    // re-writing an identical note would churn updatedAt, which the session
    // hero reads as fresh activity for its idle escalation.
    const tx = setupTxMock({ existingLogs: existingBench('same note') });
    await save([{ ...benchEntry, notes: 'same note' }]);

    expect(tx.update).not.toHaveBeenCalled();
  });

  it('clears the note to NULL when the trainer empties the field', async () => {
    const tx = setupTxMock({ existingLogs: existingBench('delete me') });
    await save([{ ...benchEntry, notes: '' }]);

    expect(tx.update).toHaveBeenCalledTimes(1);
    const updateCall = tx.update.mock.calls[0]![0] as { data: { notes?: string | null } };
    expect(updateCall.data.notes).toBeNull();
  });

  it('does not re-clear an already-empty note', async () => {
    // '' from the UI and NULL in the DB are the same state, so an untouched
    // empty field must not generate a write on every autosave pass.
    const tx = setupTxMock({ existingLogs: existingBench(null) });
    await save([{ ...benchEntry, notes: '' }]);

    expect(tx.update).not.toHaveBeenCalled();
  });

  it('carries a note on an exercise logged with zero sets', async () => {
    // "skipped — knee pain" is a legitimate note on an exercise that never
    // got a set logged against it.
    const tx = setupTxMock({ existingLogs: [] });
    await save([{ exerciseId: 'ex-bench', orderIndex: 0, sets: [], notes: 'skipped — knee pain' }]);

    const createCall = tx.create.mock.calls[0]![0] as { data: { notes: string | null } };
    expect(createCall.data.notes).toBe('skipped — knee pain');
  });

  it('updates the note alongside a completion toggle in one write', async () => {
    const tx = setupTxMock({ existingLogs: existingBench(null) });
    await save([{ ...benchEntry, isCompleted: true, notes: 'solid session' }]);

    expect(tx.update).toHaveBeenCalledTimes(1);
    const updateCall = tx.update.mock.calls[0]![0] as {
      data: { notes?: string | null; isCompleted?: boolean; completedAt?: Date | null };
    };
    expect(updateCall.data.notes).toBe('solid session');
    expect(updateCall.data.isCompleted).toBe(true);
    expect(updateCall.data.completedAt).toBeInstanceOf(Date);
  });
});
