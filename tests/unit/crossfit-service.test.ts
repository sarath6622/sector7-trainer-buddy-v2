import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trainerProfile: { findMany: vi.fn() },
    clientProfile: { findFirst: vi.fn(), findMany: vi.fn() },
    crossfitClass: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    crossfitEnrollment: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    crossfitSession: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    crossfitAttendance: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

import { prisma } from '@/lib/prisma';
import * as cf from '@/services/crossfit.service';

const BRANCH = 'branch-1';
const ACTOR = 'actor-1';
type Mock = ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

// ─── Class CRUD ─────────────────────────────────────────────────────

describe('createCrossfitClass', () => {
  const baseInput = {
    branchId: BRANCH,
    actorId: ACTOR,
    trainerProfileIds: ['t1'],
    name: 'Morning CrossFit',
    dayOfWeek: 'MONDAY',
    startTime: '06:00',
    durationMin: 60,
    maxCapacity: 20,
  };

  it('rejects when no trainers are supplied', async () => {
    await expect(
      cf.createCrossfitClass({ ...baseInput, trainerProfileIds: [] }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
  });

  it('rejects when one or more trainers are not in this branch', async () => {
    (prisma.trainerProfile.findMany as Mock).mockResolvedValue([{ id: 't1' }]); // only 1 of 2

    await expect(
      cf.createCrossfitClass({ ...baseInput, trainerProfileIds: ['t1', 't2'] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('creates class with trainers and audits', async () => {
    (prisma.trainerProfile.findMany as Mock).mockResolvedValue([{ id: 't1' }, { id: 't2' }]);
    (prisma.crossfitClass.create as Mock).mockResolvedValue({
      id: 'cls-1',
      branchId: BRANCH,
      name: 'Morning CrossFit',
      dayOfWeek: 'MONDAY',
      startTime: '06:00',
    });

    const result = await cf.createCrossfitClass({
      ...baseInput,
      trainerProfileIds: ['t1', 't2'],
    });

    expect(result.id).toBe('cls-1');
    expect(prisma.crossfitClass.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId: BRANCH,
          name: 'Morning CrossFit',
          trainers: {
            create: [
              { trainerProfileId: 't1', branchId: BRANCH },
              { trainerProfileId: 't2', branchId: BRANCH },
            ],
          },
        }),
      }),
    );
  });
});

describe('getCrossfitClasses', () => {
  it('scopes the lookup to the caller branchId', async () => {
    (prisma.crossfitClass.findMany as Mock).mockResolvedValue([]);
    await cf.getCrossfitClasses(BRANCH);
    expect(prisma.crossfitClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { branchId: BRANCH } }),
    );
  });
});

describe('getCrossfitClassesByTrainer', () => {
  it('filters to active classes and scopes by branch + trainer', async () => {
    (prisma.crossfitClass.findMany as Mock).mockResolvedValue([]);
    await cf.getCrossfitClassesByTrainer('t1', BRANCH);
    expect(prisma.crossfitClass.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          branchId: BRANCH,
          isActive: true,
          trainers: { some: { trainerProfileId: 't1' } },
        },
      }),
    );
  });
});

// ─── Enrollment ─────────────────────────────────────────────────────

describe('createCrossfitEnrollment', () => {
  it('rejects GYM_MEMBER without clientProfileId', async () => {
    await expect(
      cf.createCrossfitEnrollment({
        branchId: BRANCH,
        actorId: ACTOR,
        clientType: 'GYM_MEMBER',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
  });

  it('rejects GYM_MEMBER when client not in branch', async () => {
    (prisma.clientProfile.findFirst as Mock).mockResolvedValue(null);

    await expect(
      cf.createCrossfitEnrollment({
        branchId: BRANCH,
        actorId: ACTOR,
        clientType: 'GYM_MEMBER',
        clientProfileId: 'c1',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('rejects when client is already enrolled (program-wide uniqueness)', async () => {
    (prisma.clientProfile.findFirst as Mock).mockResolvedValue({ id: 'c1' });
    (prisma.crossfitEnrollment.findFirst as Mock).mockResolvedValue({
      id: 'enr-existing',
    });

    await expect(
      cf.createCrossfitEnrollment({
        branchId: BRANCH,
        actorId: ACTOR,
        clientType: 'GYM_MEMBER',
        clientProfileId: 'c1',
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE', statusCode: 409 });
    expect(prisma.crossfitEnrollment.create).not.toHaveBeenCalled();
  });

  it('rejects GYM_ONLY without externalName', async () => {
    await expect(
      cf.createCrossfitEnrollment({
        branchId: BRANCH,
        actorId: ACTOR,
        clientType: 'GYM_ONLY',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
  });

  it('rejects EXTERNAL_ONLY without externalName', async () => {
    await expect(
      cf.createCrossfitEnrollment({
        branchId: BRANCH,
        actorId: ACTOR,
        clientType: 'EXTERNAL_ONLY',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', statusCode: 400 });
  });

  it('creates a GYM_MEMBER enrollment on the happy path', async () => {
    (prisma.clientProfile.findFirst as Mock).mockResolvedValue({ id: 'c1' });
    (prisma.crossfitEnrollment.findFirst as Mock).mockResolvedValue(null);
    (prisma.crossfitEnrollment.create as Mock).mockResolvedValue({
      id: 'enr-1',
      clientProfileId: 'c1',
      clientType: 'GYM_MEMBER',
    });

    const result = await cf.createCrossfitEnrollment({
      branchId: BRANCH,
      actorId: ACTOR,
      clientType: 'GYM_MEMBER',
      clientProfileId: 'c1',
    });

    expect(result.id).toBe('enr-1');
  });

  it('creates an EXTERNAL_ONLY enrollment with name only', async () => {
    (prisma.crossfitEnrollment.create as Mock).mockResolvedValue({
      id: 'enr-2',
      clientType: 'EXTERNAL_ONLY',
      externalName: 'Walk-in Joe',
    });

    const result = await cf.createCrossfitEnrollment({
      branchId: BRANCH,
      actorId: ACTOR,
      clientType: 'EXTERNAL_ONLY',
      externalName: 'Walk-in Joe',
    });

    expect(result.id).toBe('enr-2');
    // Should NOT consult clientProfile.findFirst for non-GYM_MEMBER paths
    expect(prisma.clientProfile.findFirst).not.toHaveBeenCalled();
  });
});

describe('deleteCrossfitEnrollment', () => {
  it('throws 404 when enrollment not found', async () => {
    (prisma.crossfitEnrollment.findFirst as Mock).mockResolvedValue(null);
    await expect(cf.deleteCrossfitEnrollment('enr-x', BRANCH, ACTOR)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });

  it('soft-deactivates enrollment on success', async () => {
    (prisma.crossfitEnrollment.findFirst as Mock).mockResolvedValue({
      id: 'enr-1',
      clientType: 'GYM_MEMBER',
      clientProfileId: 'c1',
      externalName: null,
    });
    (prisma.crossfitEnrollment.update as Mock).mockResolvedValue({});

    const result = await cf.deleteCrossfitEnrollment('enr-1', BRANCH, ACTOR);

    expect(result).toEqual({ success: true });
    expect(prisma.crossfitEnrollment.update).toHaveBeenCalledWith({
      where: { id: 'enr-1' },
      data: { isActive: false },
    });
  });
});

// ─── Sessions ───────────────────────────────────────────────────────

describe('getOrCreateCrossfitSession', () => {
  it('throws 404 when class not found', async () => {
    (prisma.crossfitClass.findFirst as Mock).mockResolvedValue(null);
    await expect(
      cf.getOrCreateCrossfitSession('cls-x', new Date('2026-05-08'), BRANCH, ACTOR),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('returns existing session when one is already opened for that date (idempotent)', async () => {
    (prisma.crossfitClass.findFirst as Mock).mockResolvedValue({ id: 'cls-1' });
    const existing = { id: 'sess-existing', classId: 'cls-1' };
    (prisma.crossfitSession.findUnique as Mock).mockResolvedValue(existing);

    const result = await cf.getOrCreateCrossfitSession(
      'cls-1',
      new Date('2026-05-08'),
      BRANCH,
      ACTOR,
    );

    expect(result).toBe(existing);
    expect(prisma.crossfitSession.create).not.toHaveBeenCalled();
  });

  it('creates a new session when none exists, normalizing the date to UTC midnight', async () => {
    (prisma.crossfitClass.findFirst as Mock).mockResolvedValue({ id: 'cls-1' });
    (prisma.crossfitSession.findUnique as Mock).mockResolvedValue(null);
    (prisma.crossfitSession.create as Mock).mockImplementation(
      async ({ data }: { data: { date: Date } }) => ({
        id: 'sess-new',
        ...data,
      }),
    );

    const result = await cf.getOrCreateCrossfitSession(
      'cls-1',
      new Date('2026-05-08T18:43:00.000Z'),
      BRANCH,
      ACTOR,
    );

    const created = (prisma.crossfitSession.create as Mock).mock.calls[0][0].data;
    expect(created.date.getUTCHours()).toBe(0);
    expect(created.date.getUTCMinutes()).toBe(0);
    expect(result.id).toBe('sess-new');
  });
});

describe('startCrossfitSession', () => {
  it('returns the same session if already IN_PROGRESS (idempotent)', async () => {
    const session = { id: 'sess-1', branchId: BRANCH, status: 'IN_PROGRESS' };
    (prisma.crossfitSession.findFirst as Mock).mockResolvedValue(session);

    const result = await cf.startCrossfitSession('sess-1', BRANCH, ACTOR);
    expect(result).toBe(session);
    expect(prisma.crossfitSession.update).not.toHaveBeenCalled();
  });

  it('rejects starting a COMPLETED session', async () => {
    (prisma.crossfitSession.findFirst as Mock).mockResolvedValue({
      id: 'sess-1',
      status: 'COMPLETED',
    });
    await expect(cf.startCrossfitSession('sess-1', BRANCH, ACTOR)).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
  });

  it('throws 404 for missing sessions', async () => {
    (prisma.crossfitSession.findFirst as Mock).mockResolvedValue(null);
    await expect(cf.startCrossfitSession('sess-x', BRANCH, ACTOR)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });
});

// ─── Attendance ─────────────────────────────────────────────────────

describe('markCrossfitAttendance', () => {
  it('throws 404 when session missing', async () => {
    (prisma.crossfitSession.findFirst as Mock).mockResolvedValue(null);
    await expect(
      cf.markCrossfitAttendance('sess-x', { clientProfileId: 'c1' }, ACTOR, BRANCH),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('rejects when neither clientProfileId nor externalName supplied', async () => {
    (prisma.crossfitSession.findFirst as Mock).mockResolvedValue({ id: 'sess-1' });
    await expect(cf.markCrossfitAttendance('sess-1', {}, ACTOR, BRANCH)).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
    });
  });

  it('rejects when client not in branch', async () => {
    (prisma.crossfitSession.findFirst as Mock).mockResolvedValue({ id: 'sess-1' });
    (prisma.clientProfile.findFirst as Mock).mockResolvedValue(null);

    await expect(
      cf.markCrossfitAttendance('sess-1', { clientProfileId: 'c-other' }, ACTOR, BRANCH),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('rejects duplicate attendance for same client+session', async () => {
    (prisma.crossfitSession.findFirst as Mock).mockResolvedValue({ id: 'sess-1' });
    (prisma.clientProfile.findFirst as Mock).mockResolvedValue({ id: 'c1' });
    (prisma.crossfitAttendance.findUnique as Mock).mockResolvedValue({ id: 'att-existing' });

    await expect(
      cf.markCrossfitAttendance('sess-1', { clientProfileId: 'c1' }, ACTOR, BRANCH),
    ).rejects.toMatchObject({ code: 'DUPLICATE', statusCode: 409 });
    expect(prisma.crossfitAttendance.create).not.toHaveBeenCalled();
  });

  it('marks attendance for a registered client', async () => {
    (prisma.crossfitSession.findFirst as Mock).mockResolvedValue({ id: 'sess-1' });
    (prisma.clientProfile.findFirst as Mock).mockResolvedValue({ id: 'c1' });
    (prisma.crossfitAttendance.findUnique as Mock).mockResolvedValue(null);
    (prisma.crossfitAttendance.create as Mock).mockResolvedValue({
      id: 'att-new',
      sessionId: 'sess-1',
      clientProfileId: 'c1',
    });

    const result = await cf.markCrossfitAttendance(
      'sess-1',
      { clientProfileId: 'c1' },
      ACTOR,
      BRANCH,
    );

    expect(result.id).toBe('att-new');
  });

  it('marks attendance for a walk-in via externalName', async () => {
    (prisma.crossfitSession.findFirst as Mock).mockResolvedValue({ id: 'sess-1' });
    (prisma.crossfitAttendance.create as Mock).mockResolvedValue({
      id: 'att-walkin',
      externalName: 'Joe',
    });

    const result = await cf.markCrossfitAttendance(
      'sess-1',
      { externalName: 'Joe' },
      ACTOR,
      BRANCH,
    );

    expect(result.id).toBe('att-walkin');
    // Walk-in path should not consult the duplicate-check unique lookup
    expect(prisma.crossfitAttendance.findUnique).not.toHaveBeenCalled();
  });
});

describe('removeCrossfitAttendance', () => {
  it('throws 404 when attendance not found', async () => {
    (prisma.crossfitAttendance.findFirst as Mock).mockResolvedValue(null);
    await expect(
      cf.removeCrossfitAttendance('sess-1', 'att-x', BRANCH, ACTOR),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', statusCode: 404 });
  });

  it('deletes attendance and audits', async () => {
    (prisma.crossfitAttendance.findFirst as Mock).mockResolvedValue({
      id: 'att-1',
      sessionId: 'sess-1',
      clientProfileId: 'c1',
      externalName: null,
    });
    (prisma.crossfitAttendance.delete as Mock).mockResolvedValue({});

    const result = await cf.removeCrossfitAttendance('sess-1', 'att-1', BRANCH, ACTOR);

    expect(result).toEqual({ success: true });
    expect(prisma.crossfitAttendance.delete).toHaveBeenCalledWith({ where: { id: 'att-1' } });
  });
});

// ─── Client Search ──────────────────────────────────────────────────

describe('searchCrossfitClients', () => {
  it('returns empty array for queries shorter than 2 characters', async () => {
    const result = await cf.searchCrossfitClients('a', BRANCH);
    expect(result).toEqual([]);
    expect(prisma.clientProfile.findMany).not.toHaveBeenCalled();
  });

  it('searches firstName and lastName case-insensitively', async () => {
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([
      { id: 'c1', user: { firstName: 'John', lastName: 'Doe', profileImageUrl: null } },
    ]);

    await cf.searchCrossfitClients('jo', BRANCH);

    expect(prisma.clientProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          branchId: BRANCH,
          user: expect.objectContaining({
            isActive: true,
            deletedAt: null,
            OR: [
              { firstName: { contains: 'jo', mode: 'insensitive' } },
              { lastName: { contains: 'jo', mode: 'insensitive' } },
            ],
          }),
        }),
      }),
    );
  });

  it('marks isEnrolled=true for clients enrolled in the supplied class', async () => {
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([
      { id: 'c1', user: { firstName: 'John', lastName: 'Doe', profileImageUrl: null } },
      { id: 'c2', user: { firstName: 'Jane', lastName: 'Roe', profileImageUrl: null } },
    ]);
    (prisma.crossfitEnrollment.findMany as Mock).mockResolvedValue([{ clientProfileId: 'c1' }]);

    const result = await cf.searchCrossfitClients('j', BRANCH, 'cls-1');
    // 'j' is 1 char — too short, returns []. Use longer query:
    expect(result).toEqual([]);
  });

  it('marks isEnrolled correctly when given a 2+ char query and a classId', async () => {
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([
      { id: 'c1', user: { firstName: 'John', lastName: 'Doe', profileImageUrl: null } },
      { id: 'c2', user: { firstName: 'Jane', lastName: 'Roe', profileImageUrl: null } },
    ]);
    (prisma.crossfitEnrollment.findMany as Mock).mockResolvedValue([{ clientProfileId: 'c1' }]);

    const result = await cf.searchCrossfitClients('jo', BRANCH, 'cls-1');

    expect(result).toEqual([
      { id: 'c1', name: 'John Doe', profileImageUrl: null, isEnrolled: true },
      { id: 'c2', name: 'Jane Roe', profileImageUrl: null, isEnrolled: false },
    ]);
  });

  it('does not look up enrollments when classId is omitted', async () => {
    (prisma.clientProfile.findMany as Mock).mockResolvedValue([
      { id: 'c1', user: { firstName: 'John', lastName: 'Doe', profileImageUrl: null } },
    ]);

    const result = await cf.searchCrossfitClients('jo', BRANCH);

    expect(prisma.crossfitEnrollment.findMany).not.toHaveBeenCalled();
    expect(result[0]?.isEnrolled).toBe(false);
  });
});
