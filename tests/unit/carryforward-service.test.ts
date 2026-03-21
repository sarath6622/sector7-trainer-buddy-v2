import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    ptPackage: { findMany: vi.fn() },
    sessionInstance: { findMany: vi.fn(), count: vi.fn(), createMany: vi.fn() },
    branchSettings: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { getConsumptionSummary, processMonthEnd } from '@/services/carryforward.service';

const BRANCH = 'branch-1';
const ACTOR = 'admin-1';

const mockPtPackage = (clientProfileId: string, name: string, sessionsPerMonth = 12) => ({
  clientProfileId,
  trainerProfileId: 'tp-1',
  sessionsPerMonth,
  client: {
    user: { firstName: name.split(' ')[0], lastName: name.split(' ')[1] ?? '' },
  },
});

describe('carryforward.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getConsumptionSummary ────────────────────

  describe('getConsumptionSummary', () => {
    it('should calculate consumption for each client', async () => {
      (prisma.ptPackage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        mockPtPackage('cp-1', 'Alice Smith', 12),
      ]);

      (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { status: 'COMPLETED', isCarryForward: false },
        { status: 'COMPLETED', isCarryForward: false },
        { status: 'NO_SHOW', isCarryForward: false },
        { status: 'SCHEDULED', isCarryForward: false },
        { status: 'SCHEDULED', isCarryForward: true }, // carry-forward from prev month
        { status: 'CANCELLED', isCarryForward: false },
      ]);

      (prisma.branchSettings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        carryForwardLimit: 3,
      });

      const result = await getConsumptionSummary(BRANCH, '2026-03');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        clientProfileId: 'cp-1',
        clientName: 'Alice Smith',
        total: 6,
        completed: 2,
        noShow: 1,
        cancelled: 1,
        used: 3, // 2 completed + 1 no-show
        unused: 2, // 6 - 3 used - 1 cancelled = 2
        carryForwardIn: 1,
        eligibleCarryForward: 2, // min(2 unused, 3 limit)
      });
    });

    it('should cap carry-forward at branch limit', async () => {
      (prisma.ptPackage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        mockPtPackage('cp-1', 'Bob Jones', 12),
      ]);

      // 12 total, 5 completed, 0 no-show, 0 cancelled = 7 unused
      const sessions = Array(5)
        .fill({ status: 'COMPLETED', isCarryForward: false })
        .concat(Array(7).fill({ status: 'SCHEDULED', isCarryForward: false }));
      (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(sessions);

      (prisma.branchSettings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        carryForwardLimit: 3,
      });

      const result = await getConsumptionSummary(BRANCH, '2026-03');

      expect(result[0]!.unused).toBe(7);
      expect(result[0]!.eligibleCarryForward).toBe(3); // capped at limit
    });

    it('should use default limit of 3 when no settings exist', async () => {
      (prisma.ptPackage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        mockPtPackage('cp-1', 'Carol White', 8),
      ]);

      (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        Array(5).fill({ status: 'SCHEDULED', isCarryForward: false }),
      );

      (prisma.branchSettings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await getConsumptionSummary(BRANCH, '2026-03');

      expect(result[0]!.eligibleCarryForward).toBe(3); // default
    });
  });

  // ─── processMonthEnd ──────────────────────────

  describe('processMonthEnd', () => {
    it('should create carry-forward sessions for next month', async () => {
      // No existing carry-forwards
      (prisma.sessionInstance.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      (prisma.branchSettings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        carryForwardLimit: 2,
        defaultSessionDurationMin: 60,
      });

      (prisma.ptPackage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        mockPtPackage('cp-1', 'Alice Smith', 10),
      ]);

      // 10 sessions, 7 completed, 0 no-show, 0 cancelled = 3 unused
      const sessions = Array(7)
        .fill({ status: 'COMPLETED' })
        .concat(Array(3).fill({ status: 'SCHEDULED' }));
      (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(sessions);

      (prisma.sessionInstance.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 2,
      });

      const result = await processMonthEnd(BRANCH, '2026-03', ACTOR);

      expect(result.processed).toBe(1);
      expect(result.carryForwardCreated).toBe(2); // min(3 unused, 2 limit)
      expect(result.expired).toBe(1); // 3 - 2 = 1 expired
      expect(prisma.sessionInstance.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            branchId: BRANCH,
            clientProfileId: 'cp-1',
            isCarryForward: true,
            status: 'SCHEDULED',
          }),
        ]),
      });
    });

    it('should not create sessions when all used', async () => {
      (prisma.sessionInstance.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      (prisma.branchSettings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        carryForwardLimit: 3,
        defaultSessionDurationMin: 60,
      });

      (prisma.ptPackage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        mockPtPackage('cp-1', 'Full User', 8),
      ]);

      // All 8 completed
      (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        Array(8).fill({ status: 'COMPLETED' }),
      );

      const result = await processMonthEnd(BRANCH, '2026-03', ACTOR);

      expect(result.carryForwardCreated).toBe(0);
      expect(result.expired).toBe(0);
      expect(prisma.sessionInstance.createMany).not.toHaveBeenCalled();
    });

    it('should reject if already processed', async () => {
      (prisma.sessionInstance.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);

      await expect(processMonthEnd(BRANCH, '2026-03', ACTOR)).rejects.toThrow(
        'already been processed',
      );
    });

    it('should handle 0 unused correctly (no carry-forward)', async () => {
      (prisma.sessionInstance.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      (prisma.branchSettings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        carryForwardLimit: 3,
        defaultSessionDurationMin: 60,
      });

      (prisma.ptPackage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        mockPtPackage('cp-1', 'No Unused', 4),
      ]);

      // 3 completed + 1 no-show = all used
      (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
        { status: 'NO_SHOW' },
      ]);

      const result = await processMonthEnd(BRANCH, '2026-03', ACTOR);

      expect(result.carryForwardCreated).toBe(0);
      expect(result.details[0]!.carriedForward).toBe(0);
    });

    it('should handle max carry-forward limit boundary', async () => {
      (prisma.sessionInstance.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      (prisma.branchSettings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        carryForwardLimit: 5,
        defaultSessionDurationMin: 45,
      });

      (prisma.ptPackage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        mockPtPackage('cp-1', 'Many Unused', 10),
      ]);

      // 10 sessions, 3 completed, 0 no-show = 7 unused
      const sessions = Array(3)
        .fill({ status: 'COMPLETED' })
        .concat(Array(7).fill({ status: 'SCHEDULED' }));
      (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(sessions);

      (prisma.sessionInstance.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 5,
      });

      const result = await processMonthEnd(BRANCH, '2026-03', ACTOR);

      expect(result.carryForwardCreated).toBe(5); // capped at limit
      expect(result.expired).toBe(2); // 7 - 5 = 2
    });

    it('should process multiple clients', async () => {
      (prisma.sessionInstance.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

      (prisma.branchSettings.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        carryForwardLimit: 2,
        defaultSessionDurationMin: 60,
      });

      (prisma.ptPackage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        mockPtPackage('cp-1', 'Client One', 8),
        mockPtPackage('cp-2', 'Client Two', 6),
      ]);

      // First call for cp-1: 6 completed + 2 scheduled = 2 unused
      // Second call for cp-2: 4 completed + 2 scheduled = 2 unused
      (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(
          Array(6)
            .fill({ status: 'COMPLETED' })
            .concat(Array(2).fill({ status: 'SCHEDULED' })),
        )
        .mockResolvedValueOnce(
          Array(4)
            .fill({ status: 'COMPLETED' })
            .concat(Array(2).fill({ status: 'SCHEDULED' })),
        );

      (prisma.sessionInstance.createMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 2,
      });

      const result = await processMonthEnd(BRANCH, '2026-03', ACTOR);

      expect(result.processed).toBe(2);
      expect(result.carryForwardCreated).toBe(4); // 2 + 2
      expect(result.details).toHaveLength(2);
    });
  });
});
