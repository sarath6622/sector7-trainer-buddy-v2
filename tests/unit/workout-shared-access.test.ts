import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock workout.service dependencies ─────────────────────────────────────
// Mirrors the autopost test's mock graph since the service calls into all the
// same downstream services. The new dimension here is asserting how the
// shared `actorTrainerProfileId` / `actorClientProfileId` parameters flow
// through to assertSessionAccess and the audit log (ADR-036).

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

const mockAuditLog = vi.fn();
vi.mock('@/lib/audit', () => ({ auditLog: (...args: unknown[]) => mockAuditLog(...args) }));

vi.mock('@/services/badge.service', () => ({
  evaluatePRBadges: vi.fn().mockResolvedValue([]),
  evaluateWeightLiftedBadges: vi.fn().mockResolvedValue([]),
  evaluateExerciseMilestoneBadges: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/services/community.service', () => ({
  createPost: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import * as workout from '@/services/workout.service';

const BRANCH = 'branch-1';
const ACTOR_USER = 'user-1';
const SESSION_ID = 'sess-1';
const TRAINER_ID = 'trainer-1';
const CLIENT_ID = 'client-1';
type Mock = ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();

  (prisma.exercise.findMany as Mock).mockResolvedValue([{ id: 'ex-bench' }]);
  (prisma.exercise.findUnique as Mock).mockResolvedValue({ isCompound: false });
  (prisma.workoutSet.aggregate as Mock).mockResolvedValue({ _max: { weightKg: null } });
  (prisma.communityPost.findFirst as Mock).mockResolvedValue(null);

  // Minimal tx mock — just enough to surface a created log to the badge eval
  // pass that runs after the transaction commits.
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const log = {
      id: 'log-1',
      exerciseId: 'ex-bench',
      exercise: { id: 'ex-bench', name: 'Bench Press' },
      sets: [{ setNumber: 1, weightKg: 60, reps: 10 }],
    };
    const tx = {
      workoutLog: {
        findMany: vi.fn().mockResolvedValue([]),
        deleteMany: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue(log),
        update: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(log),
      },
      workoutSet: { deleteMany: vi.fn().mockResolvedValue({}) },
    };
    return fn(tx);
  });
});

const benchEntry = {
  exerciseId: 'ex-bench',
  orderIndex: 0,
  sets: [{ setNumber: 1, weightKg: 60, reps: 10 }],
};

// ── Access-control: trainer of the session ─────────────────────────────────

describe('createWorkoutLogs — actor can be trainer OR client of session (ADR-036)', () => {
  it('allows the trainer of the session to log', async () => {
    (prisma.sessionInstance.findFirst as Mock).mockResolvedValue({
      id: SESSION_ID,
      branchId: BRANCH,
      trainerProfileId: TRAINER_ID,
      clientProfileId: CLIENT_ID,
      status: 'IN_PROGRESS',
      scheduledDate: new Date(),
      startedAt: new Date(),
    });

    const result = await workout.createWorkoutLogs({
      sessionInstanceId: SESSION_ID,
      exercises: [benchEntry],
      actorUserId: ACTOR_USER,
      actorTrainerProfileId: TRAINER_ID,
      actorClientProfileId: null,
      branchId: BRANCH,
    });

    expect(result.workoutLogs).toHaveLength(1);
    // Audit metadata tags this save as trainer-initiated so downstream tools
    // can distinguish trainer-logged vs client-logged workouts.
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WORKOUT_LOGGED',
        actorId: ACTOR_USER,
        metadata: expect.objectContaining({ loggedBy: 'TRAINER' }),
      }),
    );
  });

  it('allows the client of the session to log their own workout', async () => {
    (prisma.sessionInstance.findFirst as Mock).mockResolvedValue({
      id: SESSION_ID,
      branchId: BRANCH,
      trainerProfileId: TRAINER_ID,
      clientProfileId: CLIENT_ID,
      status: 'IN_PROGRESS',
      scheduledDate: new Date(),
      startedAt: new Date(),
    });

    const result = await workout.createWorkoutLogs({
      sessionInstanceId: SESSION_ID,
      exercises: [benchEntry],
      actorUserId: ACTOR_USER,
      actorTrainerProfileId: null,
      actorClientProfileId: CLIENT_ID,
      branchId: BRANCH,
    });

    expect(result.workoutLogs).toHaveLength(1);
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WORKOUT_LOGGED',
        actorId: ACTOR_USER,
        metadata: expect.objectContaining({ loggedBy: 'CLIENT' }),
      }),
    );
  });

  it('rejects a trainer who is NOT the trainer of this session', async () => {
    (prisma.sessionInstance.findFirst as Mock).mockResolvedValue({
      id: SESSION_ID,
      branchId: BRANCH,
      trainerProfileId: 'other-trainer',
      clientProfileId: CLIENT_ID,
      status: 'IN_PROGRESS',
    });

    await expect(
      workout.createWorkoutLogs({
        sessionInstanceId: SESSION_ID,
        exercises: [benchEntry],
        actorUserId: ACTOR_USER,
        actorTrainerProfileId: TRAINER_ID,
        actorClientProfileId: null,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Not allowed to access this session');
  });

  it("rejects a client trying to log on someone else's session", async () => {
    (prisma.sessionInstance.findFirst as Mock).mockResolvedValue({
      id: SESSION_ID,
      branchId: BRANCH,
      trainerProfileId: TRAINER_ID,
      clientProfileId: 'other-client',
      status: 'IN_PROGRESS',
    });

    await expect(
      workout.createWorkoutLogs({
        sessionInstanceId: SESSION_ID,
        exercises: [benchEntry],
        actorUserId: ACTOR_USER,
        actorTrainerProfileId: null,
        actorClientProfileId: CLIENT_ID,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Not allowed to access this session');
  });

  it('rejects when both profile ids are null (no actor identity)', async () => {
    (prisma.sessionInstance.findFirst as Mock).mockResolvedValue({
      id: SESSION_ID,
      branchId: BRANCH,
      trainerProfileId: TRAINER_ID,
      clientProfileId: CLIENT_ID,
      status: 'IN_PROGRESS',
    });

    await expect(
      workout.createWorkoutLogs({
        sessionInstanceId: SESSION_ID,
        exercises: [benchEntry],
        actorUserId: ACTOR_USER,
        actorTrainerProfileId: null,
        actorClientProfileId: null,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Not allowed to access this session');
  });

  it('rejects when session belongs to a different branch', async () => {
    // assertSessionAccess's findFirst is scoped on branchId — a session in
    // another branch is invisible to the caller and surfaces as 404, not 403.
    (prisma.sessionInstance.findFirst as Mock).mockResolvedValue(null);

    await expect(
      workout.createWorkoutLogs({
        sessionInstanceId: SESSION_ID,
        exercises: [benchEntry],
        actorUserId: ACTOR_USER,
        actorTrainerProfileId: TRAINER_ID,
        actorClientProfileId: null,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Session not found');
  });

  it('rejects when session is SCHEDULED (not yet started)', async () => {
    (prisma.sessionInstance.findFirst as Mock).mockResolvedValue({
      id: SESSION_ID,
      branchId: BRANCH,
      trainerProfileId: TRAINER_ID,
      clientProfileId: CLIENT_ID,
      status: 'SCHEDULED',
    });

    await expect(
      workout.createWorkoutLogs({
        sessionInstanceId: SESSION_ID,
        exercises: [benchEntry],
        actorUserId: ACTOR_USER,
        actorTrainerProfileId: TRAINER_ID,
        actorClientProfileId: null,
        branchId: BRANCH,
      }),
    ).rejects.toThrow('Can only log workouts for active or completed sessions');
  });
});
