import { describe, it, expect, vi, beforeEach } from 'vitest';

// ADR-053 — training routines service. Mocked Prisma; covers the access matrix
// (staff / manage-client / trainer-of-session), copy-on-assign, the "Next up"
// rotation and the idempotent apply-to-session.

const tx = {
  routineProgram: { findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  routine: { deleteMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  routineExercise: { deleteMany: vi.fn(), findMany: vi.fn() },
  workoutLog: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  sessionInstance: { update: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    routineProgram: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    routine: { findFirst: vi.fn() },
    clientProfile: { findFirst: vi.fn() },
    ptPackage: { findFirst: vi.fn() },
    exercise: { findMany: vi.fn() },
    sessionInstance: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  },
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import * as routine from '@/services/routine.service';
import type { RoutineActor } from '@/services/routine.service';
import type { RoutineProgramInput } from '@/lib/validators';

type Mock = ReturnType<typeof vi.fn>;
const m = prisma as unknown as {
  routineProgram: Record<string, Mock>;
  routine: Record<string, Mock>;
  clientProfile: Record<string, Mock>;
  ptPackage: Record<string, Mock>;
  exercise: Record<string, Mock>;
  sessionInstance: Record<string, Mock>;
};

const BRANCH = 'branch-1';
const CLIENT = 'client-1';

const admin: RoutineActor = {
  userId: 'u-admin',
  roles: ['BRANCH_ADMIN'],
  trainerProfileId: null,
  clientProfileId: null,
};
const trainer: RoutineActor = {
  userId: 'u-trainer',
  roles: ['TRAINER'],
  trainerProfileId: 'tp-1',
  clientProfileId: null,
};
const clientActor: RoutineActor = {
  userId: 'u-client',
  roles: ['CLIENT'],
  trainerProfileId: null,
  clientProfileId: CLIENT,
};

const input: RoutineProgramInput = {
  name: 'Push / Pull / Legs',
  notes: '  ',
  routines: [
    {
      name: 'Push Day',
      exercises: [
        {
          exerciseId: 'ex-bench',
          restSec: 90,
          sets: [{ targetRepsMin: 12, targetRepsMax: 12 }, { setType: 'DROP' }],
        },
      ],
    },
    { name: 'Pull Day', exercises: [{ exerciseId: 'ex-row', sets: [{}] }] },
  ],
};

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prog-1',
    name: 'Push / Pull / Legs',
    notes: null,
    clientProfileId: null,
    sourceProgramId: null,
    isActive: true,
    isArchived: false,
    updatedAt: new Date(),
    routines: [
      {
        id: 'r-a',
        name: 'Day A',
        notes: null,
        orderIndex: 0,
        exercises: [
          {
            id: 're-1',
            exerciseId: 'ex-bench',
            orderIndex: 0,
            restSec: 90,
            notes: 'Pause at the chest',
            exercise: {},
            sets: [
              {
                setNumber: 1,
                setType: 'NORMAL',
                targetRepsMin: 12,
                targetRepsMax: 15,
                targetWeightKg: null,
                targetDurationSec: null,
                targetStepsCount: null,
                targetDistance: null,
              },
            ],
          },
        ],
      },
      { id: 'r-b', name: 'Day B', notes: null, orderIndex: 1, exercises: [] },
      { id: 'r-c', name: 'Day C', notes: null, orderIndex: 2, exercises: [] },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.exercise.findMany.mockResolvedValue([{ id: 'ex-bench' }, { id: 'ex-row' }]);
  m.clientProfile.findFirst.mockResolvedValue({ id: CLIENT });
});

// ─── Pure helpers ────────────────────────────────────────────────────────────

describe('pickNextRoutineId', () => {
  const routines = [
    { id: 'c', orderIndex: 2 },
    { id: 'a', orderIndex: 0 },
    { id: 'b', orderIndex: 1 },
  ];
  it('starts at the first routine when none has been used', () => {
    expect(routine.pickNextRoutineId(routines, null)).toBe('a');
  });
  it('advances to the next routine by order', () => {
    expect(routine.pickNextRoutineId(routines, 'a')).toBe('b');
  });
  it('wraps from the last routine back to the first', () => {
    expect(routine.pickNextRoutineId(routines, 'c')).toBe('a');
  });
  it('falls back to the first routine when the last-used one was removed', () => {
    expect(routine.pickNextRoutineId(routines, 'gone')).toBe('a');
  });
  it('returns null for an empty program', () => {
    expect(routine.pickNextRoutineId([], 'a')).toBeNull();
  });
});

describe('toRoutineActor', () => {
  it('falls back to the primary role when roles[] is empty', () => {
    expect(routine.toRoutineActor({ id: 'u', role: 'TRAINER', roles: [] }).roles).toEqual([
      'TRAINER',
    ]);
  });
});

describe('programToInput', () => {
  it('round-trips a stored program into editor input for the deep copy', () => {
    const out = routine.programToInput(detail() as never);
    expect(out.routines).toHaveLength(3);
    expect(out.routines[0]?.exercises[0]).toMatchObject({
      exerciseId: 'ex-bench',
      restSec: 90,
      notes: 'Pause at the chest',
      sets: [{ setType: 'NORMAL', targetRepsMin: 12, targetRepsMax: 15 }],
    });
  });
});

// ─── Access ──────────────────────────────────────────────────────────────────

describe('assertCanManageClient', () => {
  it('lets an admin manage any client in the branch', async () => {
    await expect(routine.assertCanManageClient(admin, CLIENT, BRANCH)).resolves.toBeUndefined();
    expect(m.ptPackage.findFirst).not.toHaveBeenCalled();
  });

  it('lets a trainer manage a client they hold an active package with', async () => {
    m.ptPackage.findFirst.mockResolvedValue({ id: 'pkg-1' });
    await expect(routine.assertCanManageClient(trainer, CLIENT, BRANCH)).resolves.toBeUndefined();
    expect(m.ptPackage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          branchId: BRANCH,
          clientProfileId: CLIENT,
          trainerProfileId: 'tp-1',
          isActive: true,
        },
      }),
    );
  });

  it("rejects a trainer for someone else's client", async () => {
    m.ptPackage.findFirst.mockResolvedValue(null);
    await expect(routine.assertCanManageClient(trainer, CLIENT, BRANCH)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('rejects clients outright', async () => {
    await expect(routine.assertCanManageClient(clientActor, CLIENT, BRANCH)).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('404s a client from another branch (branch-scoped lookup)', async () => {
    m.clientProfile.findFirst.mockResolvedValue(null);
    await expect(routine.assertCanManageClient(admin, CLIENT, BRANCH)).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(m.clientProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: CLIENT, branchId: BRANCH } }),
    );
  });
});

// ─── Library ─────────────────────────────────────────────────────────────────

describe('createLibraryProgram', () => {
  it('creates a branch library template with derived order + set numbers, and audits', async () => {
    m.routineProgram.create.mockResolvedValue({ id: 'prog-new' });
    await routine.createLibraryProgram({ input, branchId: BRANCH, actor: trainer });

    const data = m.routineProgram.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ branchId: BRANCH, clientProfileId: null, notes: null });
    const [dayA, dayB] = data.routines.create;
    expect(dayA).toMatchObject({ name: 'Push Day', orderIndex: 0 });
    expect(dayB).toMatchObject({ orderIndex: 1 });
    const bench = dayA.exercises.create[0];
    expect(bench).toMatchObject({ exerciseId: 'ex-bench', orderIndex: 0, restSec: 90 });
    expect(bench.sets.create).toEqual([
      expect.objectContaining({ setNumber: 1, setType: 'NORMAL', targetRepsMin: 12 }),
      expect.objectContaining({ setNumber: 2, setType: 'DROP', targetRepsMin: null }),
    ]);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ROUTINE_PROGRAM_CREATED', subjectId: 'prog-new' }),
    );
  });

  it('rejects clients', async () => {
    await expect(
      routine.createLibraryProgram({ input, branchId: BRANCH, actor: clientActor }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(m.routineProgram.create).not.toHaveBeenCalled();
  });

  it('422s when an exercise is missing or inactive', async () => {
    m.exercise.findMany.mockResolvedValue([{ id: 'ex-bench' }]);
    await expect(
      routine.createLibraryProgram({ input, branchId: BRANCH, actor: admin }),
    ).rejects.toMatchObject({ code: 'INVALID_EXERCISE', statusCode: 422 });
  });
});

describe('getProgram', () => {
  it("hides another client's copy behind a 404", async () => {
    m.routineProgram.findFirst.mockResolvedValue(detail({ clientProfileId: 'client-2' }));
    await expect(
      routine.getProgram({ programId: 'prog-1', branchId: BRANCH, actor: clientActor }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('hides library templates from clients', async () => {
    m.routineProgram.findFirst.mockResolvedValue(detail());
    await expect(
      routine.getProgram({ programId: 'prog-1', branchId: BRANCH, actor: clientActor }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('lets a client read their own copy', async () => {
    m.routineProgram.findFirst.mockResolvedValue(detail({ clientProfileId: CLIENT }));
    await expect(
      routine.getProgram({ programId: 'prog-1', branchId: BRANCH, actor: clientActor }),
    ).resolves.toMatchObject({ id: 'prog-1' });
  });
});

describe('updateProgram', () => {
  it('updates kept routines in place, deletes dropped ones, creates new ones', async () => {
    m.routineProgram.findFirst
      .mockResolvedValueOnce({
        id: 'prog-1',
        name: 'Old',
        clientProfileId: null,
        isArchived: false,
        routines: [
          { id: 'r-a', name: 'Day A' },
          { id: 'r-gone', name: 'Old day' },
        ],
      })
      .mockResolvedValueOnce(detail());

    const next: RoutineProgramInput = {
      ...input,
      routines: [
        { ...input.routines[0]!, id: 'r-a' },
        { ...input.routines[1]!, id: 'r-foreign' }, // not in this program → created fresh
      ],
    };
    await routine.updateProgram({
      programId: 'prog-1',
      input: next,
      branchId: BRANCH,
      actor: admin,
    });

    expect(tx.routine.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['r-gone'] }, programId: 'prog-1' },
    });
    expect(tx.routineExercise.deleteMany).toHaveBeenCalledWith({ where: { routineId: 'r-a' } });
    expect(tx.routine.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r-a' } }),
    );
    expect(tx.routine.create).toHaveBeenCalledTimes(1);
    expect(tx.routine.create.mock.calls[0]?.[0].data).toMatchObject({
      programId: 'prog-1',
      orderIndex: 1,
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ROUTINE_PROGRAM_UPDATED' }),
    );
  });

  it("requires manage-client rights to edit a client's copy", async () => {
    m.routineProgram.findFirst.mockResolvedValueOnce({
      id: 'prog-1',
      name: 'Copy',
      clientProfileId: CLIENT,
      isArchived: false,
      routines: [],
    });
    m.ptPackage.findFirst.mockResolvedValue(null);
    await expect(
      routine.updateProgram({ programId: 'prog-1', input, branchId: BRANCH, actor: trainer }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(tx.routineProgram.update).not.toHaveBeenCalled();
  });
});

// ─── Assign ──────────────────────────────────────────────────────────────────

describe('assignProgram', () => {
  it('deep-copies the template, deactivates the previous copy, and audits', async () => {
    m.routineProgram.findFirst.mockResolvedValue(detail());
    tx.routineProgram.findMany.mockResolvedValue([{ id: 'old-copy' }]);
    tx.routineProgram.create.mockResolvedValue(detail({ id: 'copy-1', clientProfileId: CLIENT }));

    const copy = await routine.assignProgram({
      programId: 'prog-1',
      clientProfileId: CLIENT,
      branchId: BRANCH,
      actor: admin,
    });

    expect(copy.id).toBe('copy-1');
    expect(m.routineProgram.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'prog-1', branchId: BRANCH, clientProfileId: null, isArchived: false },
      }),
    );
    expect(tx.routineProgram.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-copy'] } },
      data: { isActive: false },
    });
    const data = tx.routineProgram.create.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      branchId: BRANCH,
      clientProfileId: CLIENT,
      sourceProgramId: 'prog-1',
      isActive: true,
    });
    expect(data.routines.create).toHaveLength(3);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ROUTINE_PROGRAM_ASSIGNED',
        metadata: expect.objectContaining({ replacedProgramIds: ['old-copy'] }),
      }),
    );
  });

  it('404s an archived or foreign template before touching the client', async () => {
    m.routineProgram.findFirst.mockResolvedValue(null);
    await expect(
      routine.assignProgram({
        programId: 'nope',
        clientProfileId: CLIENT,
        branchId: BRANCH,
        actor: admin,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(tx.routineProgram.create).not.toHaveBeenCalled();
  });
});

describe('getActiveClientProgram', () => {
  it('returns null when the client has no program', async () => {
    m.routineProgram.findFirst.mockResolvedValue(null);
    await expect(
      routine.getActiveClientProgram({ clientProfileId: CLIENT, branchId: BRANCH }),
    ).resolves.toBeNull();
  });

  it('points "Next up" at the routine after the last one used', async () => {
    m.routineProgram.findFirst.mockResolvedValue(detail({ clientProfileId: CLIENT }));
    m.sessionInstance.findFirst.mockResolvedValue({
      id: 'sess-9',
      routineId: 'r-b',
      scheduledDate: new Date('2026-10-10'),
    });
    const program = await routine.getActiveClientProgram({
      clientProfileId: CLIENT,
      branchId: BRANCH,
    });
    expect(program?.nextRoutineId).toBe('r-c');
    expect(program?.lastUsed).toMatchObject({ routineId: 'r-b', sessionId: 'sess-9' });
    expect(m.sessionInstance.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          branchId: BRANCH,
          clientProfileId: CLIENT,
          routineId: { in: ['r-a', 'r-b', 'r-c'] },
          // Only trained sessions advance the rotation.
          status: { in: ['IN_PROGRESS', 'COMPLETED'] },
          workoutLogs: { some: { sets: { some: {} } } },
        },
      }),
    );
  });
});

// ─── Sessions ────────────────────────────────────────────────────────────────

describe('applyRoutineToSession', () => {
  const liveSession = {
    id: 'sess-1',
    status: 'IN_PROGRESS',
    trainerProfileId: 'tp-1',
    clientProfileId: CLIENT,
    routineId: null,
  };

  it('appends missing exercises as zero-set logs, skips present ones, links the routine', async () => {
    m.sessionInstance.findFirst.mockResolvedValue(liveSession);
    m.routine.findFirst.mockResolvedValue({
      id: 'r-a',
      name: 'Day A',
      exercises: [{ exerciseId: 'ex-bench' }, { exerciseId: 'ex-fly' }, { exerciseId: 'ex-dip' }],
    });
    tx.workoutLog.findMany.mockResolvedValue([
      { exerciseId: 'ex-curl', orderIndex: 0 },
      { exerciseId: 'ex-bench', orderIndex: 1 },
    ]);

    const result = await routine.applyRoutineToSession({
      sessionId: 'sess-1',
      routineId: 'r-a',
      branchId: BRANCH,
      actor: trainer,
    });

    expect(result).toEqual({
      routineId: 'r-a',
      addedExerciseIds: ['ex-fly', 'ex-dip'],
      skippedExerciseIds: ['ex-bench'],
      removedExerciseIds: [],
    });
    // First routine on the session — nothing to clean up.
    expect(tx.workoutLog.deleteMany).not.toHaveBeenCalled();
    expect(tx.workoutLog.createMany).toHaveBeenCalledWith({
      data: [
        { sessionInstanceId: 'sess-1', exerciseId: 'ex-fly', orderIndex: 2 },
        { sessionInstanceId: 'sess-1', exerciseId: 'ex-dip', orderIndex: 3 },
      ],
    });
    expect(tx.sessionInstance.update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { routineId: 'r-a' },
    });
    // The routine must come from THIS client's ACTIVE copy in this branch.
    expect(m.routine.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'r-a',
          program: { branchId: BRANCH, clientProfileId: CLIENT, isActive: true, isArchived: false },
        },
      }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SESSION_ROUTINE_APPLIED', subjectId: 'sess-1' }),
    );
  });

  it('is idempotent: a second apply adds nothing', async () => {
    m.sessionInstance.findFirst.mockResolvedValue({ ...liveSession, routineId: 'r-a' });
    m.routine.findFirst.mockResolvedValue({
      id: 'r-a',
      name: 'Day A',
      exercises: [{ exerciseId: 'ex-bench' }],
    });
    tx.workoutLog.findMany.mockResolvedValue([{ exerciseId: 'ex-bench', orderIndex: 0 }]);
    const result = await routine.applyRoutineToSession({
      sessionId: 'sess-1',
      routineId: 'r-a',
      branchId: BRANCH,
      actor: trainer,
    });
    expect(result.addedExerciseIds).toEqual([]);
    expect(tx.workoutLog.createMany).not.toHaveBeenCalled();
  });

  it('refuses the client of the session (clients cannot start a routine)', async () => {
    m.sessionInstance.findFirst.mockResolvedValue(liveSession);
    await expect(
      routine.applyRoutineToSession({
        sessionId: 'sess-1',
        routineId: 'r-a',
        branchId: BRANCH,
        actor: clientActor,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuses a trainer who doesn't own the session", async () => {
    m.sessionInstance.findFirst.mockResolvedValue({ ...liveSession, trainerProfileId: 'tp-2' });
    await expect(
      routine.applyRoutineToSession({
        sessionId: 'sess-1',
        routineId: 'r-a',
        branchId: BRANCH,
        actor: trainer,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('409s when the session is not in progress', async () => {
    m.sessionInstance.findFirst.mockResolvedValue({ ...liveSession, status: 'SCHEDULED' });
    await expect(
      routine.applyRoutineToSession({
        sessionId: 'sess-1',
        routineId: 'r-a',
        branchId: BRANCH,
        actor: trainer,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_ACTIVE', statusCode: 409 });
  });

  it("404s a routine outside the client's active program", async () => {
    m.sessionInstance.findFirst.mockResolvedValue(liveSession);
    m.routine.findFirst.mockResolvedValue(null);
    await expect(
      routine.applyRoutineToSession({
        sessionId: 'sess-1',
        routineId: 'r-other',
        branchId: BRANCH,
        actor: trainer,
      }),
    ).rejects.toMatchObject({ code: 'ROUTINE_NOT_FOUND', statusCode: 404 });
    expect(tx.workoutLog.createMany).not.toHaveBeenCalled();
  });
});

describe('switching routines (edge case: wrong day tapped)', () => {
  it("removes the previous routine's untouched exercises, keeps shared + logged ones", async () => {
    m.sessionInstance.findFirst.mockResolvedValue({
      id: 'sess-1',
      status: 'IN_PROGRESS',
      trainerProfileId: 'tp-1',
      clientProfileId: CLIENT,
      routineId: 'r-old',
    });
    m.routine.findFirst.mockResolvedValue({
      id: 'r-new',
      name: 'Pull Day',
      exercises: [{ exerciseId: 'ex-row' }, { exerciseId: 'ex-shared' }],
    });
    tx.routineExercise.findMany.mockResolvedValue([
      { exerciseId: 'ex-bench' },
      { exerciseId: 'ex-fly' },
      { exerciseId: 'ex-shared' },
    ]);
    // Only untouched logs come back from the filtered query (ex-fly has sets).
    tx.workoutLog.findMany
      .mockResolvedValueOnce([{ id: 'log-bench', exerciseId: 'ex-bench' }])
      .mockResolvedValueOnce([
        { exerciseId: 'ex-fly', orderIndex: 1 },
        { exerciseId: 'ex-shared', orderIndex: 2 },
      ]);

    const result = await routine.applyRoutineToSession({
      sessionId: 'sess-1',
      routineId: 'r-new',
      branchId: BRANCH,
      actor: trainer,
    });

    // The untouched-log query excludes exercises shared with the new routine
    // and anything with sets / a note / completion.
    expect(tx.workoutLog.findMany.mock.calls[0]?.[0]).toMatchObject({
      where: {
        sessionInstanceId: 'sess-1',
        exerciseId: { in: ['ex-bench', 'ex-fly'] },
        isCompleted: false,
        sets: { none: {} },
        OR: [{ notes: null }, { notes: '' }],
      },
    });
    expect(tx.workoutLog.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['log-bench'] } } });
    expect(result).toEqual({
      routineId: 'r-new',
      addedExerciseIds: ['ex-row'],
      skippedExerciseIds: ['ex-shared'],
      removedExerciseIds: ['ex-bench'],
    });
  });

  it('re-applying the SAME routine never removes anything', async () => {
    m.sessionInstance.findFirst.mockResolvedValue({
      id: 'sess-1',
      status: 'IN_PROGRESS',
      trainerProfileId: 'tp-1',
      clientProfileId: CLIENT,
      routineId: 'r-a',
    });
    m.routine.findFirst.mockResolvedValue({ id: 'r-a', name: 'Push Day', exercises: [] });
    tx.workoutLog.findMany.mockResolvedValue([]);
    await routine.applyRoutineToSession({
      sessionId: 'sess-1',
      routineId: 'r-a',
      branchId: BRANCH,
      actor: trainer,
    });
    expect(tx.routineExercise.findMany).not.toHaveBeenCalled();
    expect(tx.workoutLog.deleteMany).not.toHaveBeenCalled();
  });
});

describe('detachRoutineFromSession', () => {
  it('clears routineId, removes untouched routine exercises, and audits', async () => {
    m.sessionInstance.findFirst.mockResolvedValue({
      id: 'sess-1',
      status: 'IN_PROGRESS',
      trainerProfileId: 'tp-1',
      clientProfileId: CLIENT,
      routineId: 'r-a',
    });
    tx.routineExercise.findMany.mockResolvedValue([
      { exerciseId: 'ex-bench' },
      { exerciseId: 'ex-fly' },
    ]);
    tx.workoutLog.findMany.mockResolvedValue([{ id: 'log-fly', exerciseId: 'ex-fly' }]);

    const result = await routine.detachRoutineFromSession({
      sessionId: 'sess-1',
      branchId: BRANCH,
      actor: trainer,
    });

    expect(result).toEqual({ routineId: null, removedExerciseIds: ['ex-fly'] });
    expect(tx.workoutLog.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['log-fly'] } } });
    expect(tx.sessionInstance.update).toHaveBeenCalledWith({
      where: { id: 'sess-1' },
      data: { routineId: null },
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SESSION_ROUTINE_DETACHED',
        metadata: { removedExerciseIds: ['ex-fly'] },
      }),
    );
  });

  it('is a no-op when no routine is linked', async () => {
    m.sessionInstance.findFirst.mockResolvedValue({
      id: 'sess-1',
      status: 'IN_PROGRESS',
      trainerProfileId: 'tp-1',
      clientProfileId: CLIENT,
      routineId: null,
    });
    const result = await routine.detachRoutineFromSession({
      sessionId: 'sess-1',
      branchId: BRANCH,
      actor: trainer,
    });
    expect(result).toEqual({ routineId: null, removedExerciseIds: [] });
    expect(tx.sessionInstance.update).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('refuses the client of the session', async () => {
    m.sessionInstance.findFirst.mockResolvedValue({
      id: 'sess-1',
      status: 'IN_PROGRESS',
      trainerProfileId: 'tp-1',
      clientProfileId: CLIENT,
      routineId: 'r-a',
    });
    await expect(
      routine.detachRoutineFromSession({
        sessionId: 'sess-1',
        branchId: BRANCH,
        actor: clientActor,
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
