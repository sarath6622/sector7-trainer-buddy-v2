import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock prisma ─────────────────────────────────────────────────────────────
vi.mock('@/lib/prisma', () => ({
  prisma: {
    sessionInstance: { findMany: vi.fn(), count: vi.fn() },
    workoutSet: { aggregate: vi.fn() },
    progressEntry: { findMany: vi.fn() },
    badgeDefinition: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    userBadge: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
    clientProfile: { findFirst: vi.fn(), findUnique: vi.fn() },
  },
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

import { prisma } from '@/lib/prisma';
import {
  evaluateStreakBadges,
  evaluateSessionMilestoneBadges,
  evaluatePRBadges,
  evaluateBodyCompositionBadges,
  evaluateWeightLiftedBadges,
} from '@/services/badge.service';

const BRANCH = 'branch-1';
const CLIENT = 'client-1';
const ACTOR = 'actor-1';

const mockBadgeDef = (
  id: string,
  threshold: number | null,
  type: string,
  genderFilter = 'ALL',
  exerciseId: string | null = null,
) => ({
  id,
  type,
  name: `Badge ${id}`,
  description: 'desc',
  icon: '🏆',
  thresholdValue: threshold,
  genderFilter,
  exerciseId,
  isActive: true,
});

beforeEach(() => {
  vi.clearAllMocks();
  // Default: client has no gender set → sees ALL badges
  vi.mocked(prisma.clientProfile.findUnique).mockResolvedValue({ gender: null } as never);
});

// ─── Streak badges ────────────────────────────────────────────────────────────

describe('evaluateStreakBadges', () => {
  it('awards streak-5 badge when 5 consecutive sessions within 7-day gaps', async () => {
    const now = new Date('2026-04-01');
    const sessions = Array.from({ length: 5 }, (_, i) => ({
      scheduledDate: new Date(now.getTime() - i * 3 * 24 * 60 * 60 * 1000), // every 3 days
    }));

    vi.mocked(prisma.sessionInstance.findMany).mockResolvedValue(sessions as never);
    vi.mocked(prisma.badgeDefinition.findMany).mockResolvedValue([
      mockBadgeDef('badge-streak-5', 5, 'STREAK'),
      mockBadgeDef('badge-streak-10', 10, 'STREAK'),
    ] as never);
    vi.mocked(prisma.userBadge.findUnique).mockResolvedValue(null); // not yet awarded
    vi.mocked(prisma.badgeDefinition.findUnique).mockResolvedValue(
      mockBadgeDef('badge-streak-5', 5, 'STREAK') as never,
    );
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    const result = await evaluateStreakBadges(CLIENT, BRANCH, ACTOR);

    expect(result).toHaveLength(1);
    expect(result[0].badgeDefinitionId).toBe('badge-streak-5');
  });

  it('resets streak when gap > 7 days', async () => {
    // Sessions ordered ascending (oldest → newest) as the service queries them
    const sessions = [
      { scheduledDate: new Date('2026-01-28') },
      { scheduledDate: new Date('2026-02-01') },
      { scheduledDate: new Date('2026-03-24') }, // > 7 days gap before this — RESET
      { scheduledDate: new Date('2026-03-28') }, // 4 days gap — in streak
      { scheduledDate: new Date('2026-04-01') }, // 4 days gap — in streak
    ];

    vi.mocked(prisma.sessionInstance.findMany).mockResolvedValue(sessions as never);
    vi.mocked(prisma.badgeDefinition.findMany).mockResolvedValue([
      mockBadgeDef('badge-streak-5', 5, 'STREAK'),
    ] as never);

    const result = await evaluateStreakBadges(CLIENT, BRANCH, ACTOR);

    // Current streak = 3, not enough for any badge
    expect(result).toHaveLength(0);
  });

  it('returns empty when no sessions', async () => {
    vi.mocked(prisma.sessionInstance.findMany).mockResolvedValue([] as never);

    const result = await evaluateStreakBadges(CLIENT, BRANCH, ACTOR);
    expect(result).toHaveLength(0);
  });

  it('does not re-award an already earned badge', async () => {
    const sessions = Array.from({ length: 5 }, (_, i) => ({
      scheduledDate: new Date(new Date('2026-04-01').getTime() - i * 3 * 24 * 60 * 60 * 1000),
    }));

    vi.mocked(prisma.sessionInstance.findMany).mockResolvedValue(sessions as never);
    vi.mocked(prisma.badgeDefinition.findMany).mockResolvedValue([
      mockBadgeDef('badge-streak-5', 5, 'STREAK'),
    ] as never);
    // badge already awarded
    vi.mocked(prisma.userBadge.findUnique).mockResolvedValue({ id: 'existing' } as never);

    const result = await evaluateStreakBadges(CLIENT, BRANCH, ACTOR);
    expect(result).toHaveLength(0);
    expect(prisma.userBadge.create).not.toHaveBeenCalled();
  });
});

// ─── Session milestone badges ─────────────────────────────────────────────────

describe('evaluateSessionMilestoneBadges', () => {
  it('awards the 10-session milestone badge at exactly 10 sessions', async () => {
    vi.mocked(prisma.sessionInstance.count).mockResolvedValue(10 as never);
    vi.mocked(prisma.badgeDefinition.findMany).mockResolvedValue([
      mockBadgeDef('badge-sessions-10', 10, 'SESSION_MILESTONE'),
      mockBadgeDef('badge-sessions-25', 25, 'SESSION_MILESTONE'),
    ] as never);
    vi.mocked(prisma.userBadge.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.badgeDefinition.findUnique).mockResolvedValue(
      mockBadgeDef('badge-sessions-10', 10, 'SESSION_MILESTONE') as never,
    );
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    const result = await evaluateSessionMilestoneBadges(CLIENT, BRANCH, ACTOR);
    expect(result).toHaveLength(1);
    expect(result[0].badgeDefinitionId).toBe('badge-sessions-10');
  });

  it('awards multiple milestone badges when threshold is exceeded', async () => {
    vi.mocked(prisma.sessionInstance.count).mockResolvedValue(30 as never);
    vi.mocked(prisma.badgeDefinition.findMany).mockResolvedValue([
      mockBadgeDef('badge-sessions-10', 10, 'SESSION_MILESTONE'),
      mockBadgeDef('badge-sessions-25', 25, 'SESSION_MILESTONE'),
      mockBadgeDef('badge-sessions-50', 50, 'SESSION_MILESTONE'),
    ] as never);
    vi.mocked(prisma.userBadge.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.badgeDefinition.findUnique)
      .mockResolvedValueOnce(mockBadgeDef('badge-sessions-10', 10, 'SESSION_MILESTONE') as never)
      .mockResolvedValueOnce(mockBadgeDef('badge-sessions-25', 25, 'SESSION_MILESTONE') as never);
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    const result = await evaluateSessionMilestoneBadges(CLIENT, BRANCH, ACTOR);
    expect(result).toHaveLength(2); // 10 and 25, but not 50
  });

  it('awards nothing below first threshold', async () => {
    vi.mocked(prisma.sessionInstance.count).mockResolvedValue(5 as never);
    vi.mocked(prisma.badgeDefinition.findMany).mockResolvedValue([
      mockBadgeDef('badge-sessions-10', 10, 'SESSION_MILESTONE'),
    ] as never);

    const result = await evaluateSessionMilestoneBadges(CLIENT, BRANCH, ACTOR);
    expect(result).toHaveLength(0);
  });
});

// ─── PR badges ────────────────────────────────────────────────────────────────

describe('evaluatePRBadges', () => {
  const EXERCISE_ID = 'ex-bench';

  it('awards PR badge when current weight exceeds historical max', async () => {
    vi.mocked(prisma.workoutSet.aggregate).mockResolvedValue({
      _max: { weightKg: 80 },
    } as never);
    const prDef = mockBadgeDef('badge-pr', null, 'PERSONAL_RECORD');
    vi.mocked(prisma.badgeDefinition.findFirst).mockResolvedValue(prDef as never);
    vi.mocked(prisma.userBadge.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.badgeDefinition.findUnique).mockResolvedValue(prDef as never);
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    const result = await evaluatePRBadges(CLIENT, BRANCH, EXERCISE_ID, 'Bench Press', 90, ACTOR);
    expect(result).toHaveLength(1);
  });

  it('does not award PR badge when weight is equal to or below historical max', async () => {
    vi.mocked(prisma.workoutSet.aggregate).mockResolvedValue({
      _max: { weightKg: 100 },
    } as never);

    const result = await evaluatePRBadges(CLIENT, BRANCH, EXERCISE_ID, 'Bench Press', 90, ACTOR);
    expect(result).toHaveLength(0);
    expect(prisma.badgeDefinition.findFirst).not.toHaveBeenCalled();
  });

  it('awards PR on first ever set (no history)', async () => {
    vi.mocked(prisma.workoutSet.aggregate).mockResolvedValue({
      _max: { weightKg: null },
    } as never);
    const prDef = mockBadgeDef('badge-pr', null, 'PERSONAL_RECORD');
    vi.mocked(prisma.badgeDefinition.findFirst).mockResolvedValue(prDef as never);
    vi.mocked(prisma.userBadge.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.badgeDefinition.findUnique).mockResolvedValue(prDef as never);
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    const result = await evaluatePRBadges(CLIENT, BRANCH, EXERCISE_ID, 'Bench Press', 60, ACTOR);
    expect(result).toHaveLength(1);
  });

  it('updates metadata on existing PR badge instead of creating new', async () => {
    vi.mocked(prisma.workoutSet.aggregate).mockResolvedValue({
      _max: { weightKg: 80 },
    } as never);
    const prDef = mockBadgeDef('badge-pr', null, 'PERSONAL_RECORD');
    vi.mocked(prisma.badgeDefinition.findFirst).mockResolvedValue(prDef as never);
    // existing badge for this exercise
    vi.mocked(prisma.userBadge.findUnique).mockResolvedValue({ id: 'existing-pr' } as never);
    vi.mocked(prisma.userBadge.update).mockResolvedValue({} as never);

    const result = await evaluatePRBadges(CLIENT, BRANCH, EXERCISE_ID, 'Bench Press', 90, ACTOR);
    expect(prisma.userBadge.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'existing-pr' } }),
    );
    expect(result).toHaveLength(0); // update doesn't return a new badge notification
  });
});

// ─── Body composition badges ──────────────────────────────────────────────────

describe('evaluateBodyCompositionBadges', () => {
  it('awards 3kg badge when client has lost >= 3kg', async () => {
    vi.mocked(prisma.progressEntry.findMany).mockResolvedValue([
      { weightKg: 85 },
      { weightKg: 82 },
      { weightKg: 81.5 },
    ] as never);
    vi.mocked(prisma.badgeDefinition.findMany).mockResolvedValue([
      mockBadgeDef('badge-body-3kg', 3, 'BODY_COMPOSITION'),
      mockBadgeDef('badge-body-5kg', 5, 'BODY_COMPOSITION'),
    ] as never);
    vi.mocked(prisma.userBadge.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.badgeDefinition.findUnique).mockResolvedValue(
      mockBadgeDef('badge-body-3kg', 3, 'BODY_COMPOSITION') as never,
    );
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    const result = await evaluateBodyCompositionBadges(CLIENT, BRANCH, ACTOR);
    expect(result).toHaveLength(1);
    expect(result[0].badgeDefinitionId).toBe('badge-body-3kg');
  });

  it('awards 3kg and 5kg badges when lost >= 5kg', async () => {
    vi.mocked(prisma.progressEntry.findMany).mockResolvedValue([
      { weightKg: 90 },
      { weightKg: 84 }, // 6kg lost
    ] as never);
    vi.mocked(prisma.badgeDefinition.findMany).mockResolvedValue([
      mockBadgeDef('badge-body-3kg', 3, 'BODY_COMPOSITION'),
      mockBadgeDef('badge-body-5kg', 5, 'BODY_COMPOSITION'),
      mockBadgeDef('badge-body-10kg', 10, 'BODY_COMPOSITION'),
    ] as never);
    vi.mocked(prisma.userBadge.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.badgeDefinition.findUnique)
      .mockResolvedValueOnce(mockBadgeDef('badge-body-3kg', 3, 'BODY_COMPOSITION') as never)
      .mockResolvedValueOnce(mockBadgeDef('badge-body-5kg', 5, 'BODY_COMPOSITION') as never);
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    const result = await evaluateBodyCompositionBadges(CLIENT, BRANCH, ACTOR);
    expect(result).toHaveLength(2);
  });

  it('does not award badge when weight has increased', async () => {
    vi.mocked(prisma.progressEntry.findMany).mockResolvedValue([
      { weightKg: 70 },
      { weightKg: 75 }, // gained weight
    ] as never);
    vi.mocked(prisma.badgeDefinition.findMany).mockResolvedValue([
      mockBadgeDef('badge-body-3kg', 3, 'BODY_COMPOSITION'),
    ] as never);

    const result = await evaluateBodyCompositionBadges(CLIENT, BRANCH, ACTOR);
    expect(result).toHaveLength(0);
  });

  it('returns empty when fewer than 2 entries', async () => {
    vi.mocked(prisma.progressEntry.findMany).mockResolvedValue([{ weightKg: 80 }] as never);

    const result = await evaluateBodyCompositionBadges(CLIENT, BRANCH, ACTOR);
    expect(result).toHaveLength(0);
  });
});

// ─── Gender filtering ────────────────────────────────────────────────────────

describe('Gender filtering', () => {
  it('male client only sees ALL + MALE badges', async () => {
    vi.mocked(prisma.clientProfile.findUnique).mockResolvedValue({ gender: 'MALE' } as never);
    vi.mocked(prisma.sessionInstance.count).mockResolvedValue(15 as never);
    vi.mocked(prisma.badgeDefinition.findMany).mockResolvedValue([
      mockBadgeDef('badge-all', 10, 'SESSION_MILESTONE', 'ALL'),
    ] as never);
    vi.mocked(prisma.userBadge.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.badgeDefinition.findUnique).mockResolvedValue(
      mockBadgeDef('badge-all', 10, 'SESSION_MILESTONE') as never,
    );
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    const result = await evaluateSessionMilestoneBadges(CLIENT, BRANCH, ACTOR);

    expect(prisma.badgeDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          genderFilter: { in: ['ALL', 'MALE'] },
        }),
      }),
    );
    expect(result).toHaveLength(1);
  });

  it('client with no gender sees only ALL badges', async () => {
    vi.mocked(prisma.clientProfile.findUnique).mockResolvedValue({ gender: null } as never);
    vi.mocked(prisma.sessionInstance.count).mockResolvedValue(15 as never);
    vi.mocked(prisma.badgeDefinition.findMany).mockResolvedValue([
      mockBadgeDef('badge-all', 10, 'SESSION_MILESTONE', 'ALL'),
    ] as never);
    vi.mocked(prisma.userBadge.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.badgeDefinition.findUnique).mockResolvedValue(
      mockBadgeDef('badge-all', 10, 'SESSION_MILESTONE') as never,
    );
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    await evaluateSessionMilestoneBadges(CLIENT, BRANCH, ACTOR);

    expect(prisma.badgeDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          genderFilter: { in: ['ALL'] },
        }),
      }),
    );
  });
});

// ─── WEIGHT_LIFTED badges ────────────────────────────────────────────────────

describe('evaluateWeightLiftedBadges', () => {
  const EXERCISE_ID = 'ex-bench';

  it('awards badge when weight meets threshold', async () => {
    vi.mocked(prisma.badgeDefinition.findMany).mockResolvedValue([
      mockBadgeDef('badge-wl-100', 100, 'WEIGHT_LIFTED', 'ALL', EXERCISE_ID),
    ] as never);
    vi.mocked(prisma.userBadge.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.badgeDefinition.findUnique).mockResolvedValue(
      mockBadgeDef('badge-wl-100', 100, 'WEIGHT_LIFTED', 'ALL', EXERCISE_ID) as never,
    );
    vi.mocked(prisma.userBadge.create).mockResolvedValue({} as never);

    const result = await evaluateWeightLiftedBadges(CLIENT, BRANCH, EXERCISE_ID, 105, ACTOR);
    expect(result).toHaveLength(1);
    expect(result[0].badgeDefinitionId).toBe('badge-wl-100');
  });

  it('does not award when weight is below threshold', async () => {
    vi.mocked(prisma.badgeDefinition.findMany).mockResolvedValue([
      mockBadgeDef('badge-wl-100', 100, 'WEIGHT_LIFTED', 'ALL', EXERCISE_ID),
    ] as never);

    const result = await evaluateWeightLiftedBadges(CLIENT, BRANCH, EXERCISE_ID, 80, ACTOR);
    expect(result).toHaveLength(0);
  });

  it('ignores badges for other exercises', async () => {
    vi.mocked(prisma.badgeDefinition.findMany).mockResolvedValue([
      mockBadgeDef('badge-wl-squat', 120, 'WEIGHT_LIFTED', 'ALL', 'ex-squat'),
    ] as never);

    const result = await evaluateWeightLiftedBadges(CLIENT, BRANCH, EXERCISE_ID, 150, ACTOR);
    expect(result).toHaveLength(0);
  });
});
