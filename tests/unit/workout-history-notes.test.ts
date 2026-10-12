import { describe, it, expect, vi, beforeEach } from 'vitest';

// ADR-052: the trainer's per-exercise note must reach the History tab for staff
// and never for the client.
//
// This pairing is the whole point of the test file:
//   GET /api/trainer/clients/[id]/workout-history is readable by the client
//   THEMSELVES (ADR-036 — their session page renders the same History tab via
//   the same endpoint). So route access can't be the gate; the note is gated on
//   `canReadTrainerPrivateNotes`, and `listWorkoutHistory` must leave the key
//   out of the payload entirely — not null it — when that's false.

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clientProfile: { findFirst: vi.fn() },
    progressEntry: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    workoutLog: { findMany: vi.fn() },
    sessionInstance: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

import { prisma } from '@/lib/prisma';
import * as progressService from '@/services/progress.service';
import { canReadTrainerPrivateNotes } from '@/lib/auth';

const BRANCH = 'branch-1';
const CLIENT_ID = 'client-1';
type Mock = ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.clientProfile.findFirst as Mock).mockResolvedValue({ id: CLIENT_ID });
  (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
    {
      id: 'sess-1',
      scheduledDate: new Date('2026-10-10T00:00:00Z'),
      scheduledTime: '16:30',
      status: 'IN_PROGRESS',
      actualDurationMin: null,
      durationMin: 60,
      workoutLogs: [
        {
          id: 'log-1',
          orderIndex: 0,
          notes: 'went light — shoulder niggle',
          exercise: {
            id: 'ex-bench',
            name: 'Bench Press',
            targetMuscleGroup: 'Chest',
            exerciseType: 'WEIGHTED',
          },
          sets: [{ id: 's1', setNumber: 1, reps: 20, weightKg: 20, durationSec: null, rpe: null }],
        },
      ],
    },
  ]);
});

/** The `select` object Prisma was called with for the workoutLogs relation. */
function workoutLogSelect() {
  const call = (prisma.sessionInstance.findMany as Mock).mock.calls[0]![0] as {
    select: { workoutLogs: { select: Record<string, unknown> } };
  };
  return call.select.workoutLogs.select;
}

describe('listWorkoutHistory — trainer note visibility (ADR-052)', () => {
  it('omits the notes key entirely by default', async () => {
    const data = await progressService.listWorkoutHistory({
      clientProfileId: CLIENT_ID,
      branchId: BRANCH,
    });
    const exercise = data[0]!.exercises[0]!;
    expect('notes' in exercise).toBe(false);
  });

  it('does not even SELECT notes when they are not included', async () => {
    // Stronger than checking the mapped output: the column must not leave the
    // database, so a future refactor that spreads the raw row can't leak it.
    await progressService.listWorkoutHistory({
      clientProfileId: CLIENT_ID,
      branchId: BRANCH,
      includeNotes: false,
    });
    expect(workoutLogSelect().notes).toBe(false);
  });

  it('returns the note when the caller is staff', async () => {
    const data = await progressService.listWorkoutHistory({
      clientProfileId: CLIENT_ID,
      branchId: BRANCH,
      includeNotes: true,
    });
    expect(workoutLogSelect().notes).toBe(true);
    expect(data[0]!.exercises[0]!.notes).toBe('went light — shoulder niggle');
  });

  it('maps a missing note to null rather than dropping the key, for staff', async () => {
    (prisma.sessionInstance.findMany as Mock).mockResolvedValue([
      {
        id: 'sess-1',
        scheduledDate: new Date('2026-10-10T00:00:00Z'),
        scheduledTime: '16:30',
        status: 'COMPLETED',
        actualDurationMin: 60,
        durationMin: 60,
        workoutLogs: [
          {
            id: 'log-1',
            orderIndex: 0,
            notes: null,
            exercise: {
              id: 'ex-bench',
              name: 'Bench Press',
              targetMuscleGroup: 'Chest',
              exerciseType: 'WEIGHTED',
            },
            sets: [],
          },
        ],
      },
    ]);
    const data = await progressService.listWorkoutHistory({
      clientProfileId: CLIENT_ID,
      branchId: BRANCH,
      includeNotes: true,
    });
    const exercise = data[0]!.exercises[0]!;
    expect('notes' in exercise).toBe(true);
    expect(exercise.notes).toBeNull();
  });
});

// The helper the routes gate on. Separate from canReadClientTrainingData,
// which also admits the client themselves — they may read their own sets, but
// not the notes written about them.
describe('canReadTrainerPrivateNotes', () => {
  it.each([['TRAINER'], ['KICKBOXING_TRAINER'], ['SUPER_ADMIN'], ['BRANCH_ADMIN']])(
    'allows %s',
    (role) => {
      expect(canReadTrainerPrivateNotes({ role })).toBe(true);
      expect(canReadTrainerPrivateNotes({ roles: [role] })).toBe(true);
    },
  );

  it('denies CLIENT — the case that keeps the note off their History tab', () => {
    expect(canReadTrainerPrivateNotes({ role: 'CLIENT' })).toBe(false);
    expect(canReadTrainerPrivateNotes({ roles: ['CLIENT'] })).toBe(false);
  });

  it('denies a user with no role at all', () => {
    expect(canReadTrainerPrivateNotes({})).toBe(false);
  });

  it('allows a multi-role user who is both a client and a trainer', () => {
    // Same User can hold both profiles (ADR-036). Being staff anywhere is
    // enough to read notes — they're the one writing them.
    expect(canReadTrainerPrivateNotes({ roles: ['CLIENT', 'TRAINER'] })).toBe(true);
  });
});
