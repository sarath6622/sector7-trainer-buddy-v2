import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  },
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import * as progressService from '@/services/progress.service';

const BRANCH = 'branch-1';
const CLIENT_ID = 'client-1';
const ACTOR = 'trainer-1';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── createProgressEntry ──────────────────────────

describe('createProgressEntry', () => {
  it('should throw if client not found in branch', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      progressService.createProgressEntry({
        clientProfileId: CLIENT_ID,
        recordedByUserId: ACTOR,
        branchId: BRANCH,
        weightKg: 75,
      }),
    ).rejects.toThrow('Client not found');
  });

  it('should create entry and audit log', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: CLIENT_ID,
      branchId: BRANCH,
    });

    const mockEntry = {
      id: 'pe-1',
      clientProfileId: CLIENT_ID,
      weightKg: 75,
      bodyFatPercent: 18.5,
      muscleMass: null,
      chest: null,
      waist: null,
      hips: null,
      bicepLeft: null,
      bicepRight: null,
      thighLeft: null,
      thighRight: null,
      photoUrls: [],
      notes: null,
    };
    (prisma.progressEntry.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockEntry);

    const result = await progressService.createProgressEntry({
      clientProfileId: CLIENT_ID,
      recordedByUserId: ACTOR,
      branchId: BRANCH,
      weightKg: 75,
      bodyFatPercent: 18.5,
    });

    expect(result).toEqual(mockEntry);
    expect(prisma.progressEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientProfileId: CLIENT_ID,
        recordedByUserId: ACTOR,
        weightKg: 75,
        bodyFatPercent: 18.5,
      }),
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROGRESS_CREATED',
        actorId: ACTOR,
        subjectType: 'ProgressEntry',
        subjectId: 'pe-1',
        branchId: BRANCH,
      }),
    );
  });
});

// ─── updateProgressEntry ──────────────────────────

describe('updateProgressEntry', () => {
  it('should throw if entry not found', async () => {
    (prisma.progressEntry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      progressService.updateProgressEntry({
        progressId: 'pe-999',
        actorId: ACTOR,
        branchId: BRANCH,
        weightKg: 80,
      }),
    ).rejects.toThrow('Progress entry not found');
  });

  it('should throw if entry belongs to different branch', async () => {
    (prisma.progressEntry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'pe-1',
      weightKg: 75,
      bodyFatPercent: 18,
      muscleMass: null,
      client: { branchId: 'other-branch' },
    });

    await expect(
      progressService.updateProgressEntry({
        progressId: 'pe-1',
        actorId: ACTOR,
        branchId: BRANCH,
        weightKg: 80,
      }),
    ).rejects.toThrow('Progress entry not found');
  });

  it('should update entry and audit log', async () => {
    (prisma.progressEntry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'pe-1',
      weightKg: 75,
      bodyFatPercent: 18,
      muscleMass: 30,
      client: { branchId: BRANCH },
    });

    const updated = { id: 'pe-1', weightKg: 80, bodyFatPercent: 17, muscleMass: 30 };
    (prisma.progressEntry.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const result = await progressService.updateProgressEntry({
      progressId: 'pe-1',
      actorId: ACTOR,
      branchId: BRANCH,
      weightKg: 80,
      bodyFatPercent: 17,
    });

    expect(result).toEqual(updated);
    expect(prisma.progressEntry.update).toHaveBeenCalledWith({
      where: { id: 'pe-1' },
      data: expect.objectContaining({ weightKg: 80, bodyFatPercent: 17 }),
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PROGRESS_UPDATED',
        subjectId: 'pe-1',
        oldValue: { weightKg: 75, bodyFatPercent: 18, muscleMass: 30 },
      }),
    );
  });
});

// ─── listProgressEntries ──────────────────────────

describe('listProgressEntries', () => {
  it('should throw if client not found', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      progressService.listProgressEntries({ clientProfileId: CLIENT_ID, branchId: BRANCH }),
    ).rejects.toThrow('Client not found');
  });

  it('should return entries ordered by date', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: CLIENT_ID,
      branchId: BRANCH,
    });

    const entries = [
      { id: 'pe-2', recordedAt: new Date('2026-03-15'), weightKg: 74 },
      { id: 'pe-1', recordedAt: new Date('2026-03-01'), weightKg: 75 },
    ];
    (prisma.progressEntry.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(entries);

    const result = await progressService.listProgressEntries({
      clientProfileId: CLIENT_ID,
      branchId: BRANCH,
    });

    expect(result).toEqual(entries);
    expect(prisma.progressEntry.findMany).toHaveBeenCalledWith({
      where: { clientProfileId: CLIENT_ID },
      orderBy: { recordedAt: 'desc' },
    });
  });
});

// ─── getChartData ─────────────────────────────────

describe('getChartData', () => {
  it('should throw if client not found', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      progressService.getChartData({
        clientProfileId: CLIENT_ID,
        branchId: BRANCH,
        metric: 'weight',
      }),
    ).rejects.toThrow('Client not found');
  });

  it('should return weight chart data', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: CLIENT_ID,
      branchId: BRANCH,
    });

    const entries = [
      { recordedAt: new Date('2026-03-01'), weightKg: 75 },
      { recordedAt: new Date('2026-03-15'), weightKg: 74 },
    ];
    (prisma.progressEntry.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(entries);

    const result = await progressService.getChartData({
      clientProfileId: CLIENT_ID,
      branchId: BRANCH,
      metric: 'weight',
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      date: entries[0].recordedAt.toISOString(),
      value: 75,
      label: 'Weight (kg)',
    });
  });

  it('should return body fat chart data', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: CLIENT_ID,
      branchId: BRANCH,
    });

    const entries = [
      { recordedAt: new Date('2026-03-01'), bodyFatPercent: 20 },
      { recordedAt: new Date('2026-03-15'), bodyFatPercent: 18.5 },
    ];
    (prisma.progressEntry.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(entries);

    const result = await progressService.getChartData({
      clientProfileId: CLIENT_ID,
      branchId: BRANCH,
      metric: 'bodyFat',
    });

    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({
      date: entries[1].recordedAt.toISOString(),
      value: 18.5,
      label: 'Body Fat (%)',
    });
  });

  it('should throw if exercise metric without exerciseId', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: CLIENT_ID,
      branchId: BRANCH,
    });

    await expect(
      progressService.getChartData({
        clientProfileId: CLIENT_ID,
        branchId: BRANCH,
        metric: 'exercise',
      }),
    ).rejects.toThrow('exerciseId is required');
  });

  it('should return exercise weight progression data', async () => {
    (prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: CLIENT_ID,
      branchId: BRANCH,
    });

    const logs = [
      {
        id: 'wl-1',
        sets: [{ weightKg: 60 }],
        sessionInstance: { scheduledDate: new Date('2026-03-01') },
      },
      {
        id: 'wl-2',
        sets: [{ weightKg: 65 }],
        sessionInstance: { scheduledDate: new Date('2026-03-08') },
      },
      {
        id: 'wl-3',
        sets: [],
        sessionInstance: { scheduledDate: new Date('2026-03-15') },
      },
    ];
    (prisma.workoutLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(logs);

    const result = await progressService.getChartData({
      clientProfileId: CLIENT_ID,
      branchId: BRANCH,
      metric: 'exercise',
      exerciseId: 'ex-1',
    });

    // Should filter out the log with no sets
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe(60);
    expect(result[1].value).toBe(65);
  });
});
