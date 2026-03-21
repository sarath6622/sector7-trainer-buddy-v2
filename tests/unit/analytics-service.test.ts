import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    trainerProfile: { findMany: vi.fn() },
    clientProfile: { findMany: vi.fn() },
    ptPackage: { findMany: vi.fn(), count: vi.fn() },
    sessionInstance: { findMany: vi.fn() },
    paymentRecord: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  getTrainerUtilization,
  getClientAttendance,
  getSessionConsumption,
  getNoShowRate,
  getRevenueOverview,
  getTrainerAnalytics,
} from '@/services/analytics.service';

const BRANCH = 'branch-1';

describe('analytics.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTrainerUtilization', () => {
    it('should calculate utilization percentage correctly', async () => {
      (prisma.trainerProfile.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'tp-1', user: { firstName: 'John', lastName: 'Doe' } },
      ]);

      (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
        { status: 'SCHEDULED' },
        { status: 'NO_SHOW' },
      ]);

      const result = await getTrainerUtilization(BRANCH, '2026-03');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        trainerName: 'John Doe',
        totalSessions: 5,
        completedSessions: 3,
        utilizationPercent: 60,
      });
    });

    it('should handle 0 sessions', async () => {
      (prisma.trainerProfile.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'tp-1', user: { firstName: 'Empty', lastName: 'Trainer' } },
      ]);
      (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await getTrainerUtilization(BRANCH, '2026-03');

      expect(result[0]!.utilizationPercent).toBe(0);
    });
  });

  describe('getClientAttendance', () => {
    it('should calculate attendance rate correctly', async () => {
      (prisma.clientProfile.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'cp-1', user: { firstName: 'Alice', lastName: 'Smith' } },
      ]);

      (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
        { status: 'NO_SHOW' },
        { status: 'CANCELLED' },
      ]);

      const result = await getClientAttendance(BRANCH, '2026-03');

      expect(result[0]).toMatchObject({
        clientName: 'Alice Smith',
        totalSessions: 4,
        attended: 2,
        noShow: 1,
        cancelled: 1,
        attendancePercent: 50,
      });
    });
  });

  describe('getSessionConsumption', () => {
    it('should calculate consumption percentage', async () => {
      (prisma.ptPackage.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          clientProfileId: 'cp-1',
          sessionsPerMonth: 10,
          client: { user: { firstName: 'Bob', lastName: 'Jones' } },
        },
      ]);

      (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { status: 'COMPLETED', isCarryForward: false },
        { status: 'COMPLETED', isCarryForward: false },
        { status: 'COMPLETED', isCarryForward: true },
        { status: 'NO_SHOW', isCarryForward: false },
        { status: 'SCHEDULED', isCarryForward: false },
      ]);

      const result = await getSessionConsumption(BRANCH, '2026-03');

      expect(result[0]).toMatchObject({
        sessionsPerMonth: 10,
        completed: 3,
        noShow: 1,
        scheduled: 1,
        carryForward: 1,
        consumptionPercent: 40, // (3+1)/10 * 100
      });
    });
  });

  describe('getNoShowRate', () => {
    it('should calculate no-show percentage per trainer', async () => {
      (prisma.trainerProfile.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'tp-1', user: { firstName: 'Jane', lastName: 'Trainer' } },
      ]);

      (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { status: 'COMPLETED' },
        { status: 'NO_SHOW' },
        { status: 'NO_SHOW' },
        { status: 'SCHEDULED' },
      ]);

      const result = await getNoShowRate(BRANCH, '2026-03');

      expect(result[0]).toMatchObject({
        totalSessions: 4,
        noShowCount: 2,
        noShowPercent: 50,
      });
    });
  });

  describe('getRevenueOverview', () => {
    it('should aggregate revenue by method', async () => {
      (prisma.paymentRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { amount: 5000, status: 'PAID', method: 'UPI' },
        { amount: 3000, status: 'PAID', method: 'CASH' },
        { amount: 5000, status: 'PAID', method: 'UPI' },
        { amount: 2000, status: 'PENDING', method: 'CARD' },
      ]);

      const result = await getRevenueOverview(BRANCH, '2026-03');

      expect(result.totalRevenue).toBe(13000);
      expect(result.paidCount).toBe(3);
      expect(result.pendingCount).toBe(1);
      expect(result.pendingAmount).toBe(2000);
      expect(result.byMethod).toHaveLength(2);
      expect(result.byMethod.find((m) => m.method === 'UPI')).toMatchObject({
        amount: 10000,
        count: 2,
      });
    });

    it('should return zeros when no payments exist', async () => {
      (prisma.paymentRecord.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await getRevenueOverview(BRANCH, '2026-03');

      expect(result.totalRevenue).toBe(0);
      expect(result.byMethod).toHaveLength(0);
    });
  });

  describe('getTrainerAnalytics', () => {
    it('should return personal analytics for trainer', async () => {
      (prisma.ptPackage.count as ReturnType<typeof vi.fn>).mockResolvedValue(5);

      (prisma.sessionInstance.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
        { status: 'COMPLETED' },
        { status: 'NO_SHOW' },
        { status: 'SCHEDULED' },
      ]);

      const result = await getTrainerAnalytics('tp-1', BRANCH);

      expect(result).toMatchObject({
        totalClients: 5,
        totalSessionsThisMonth: 5,
        completedThisMonth: 3,
        noShowThisMonth: 1,
        sessionCompletionRate: 60,
        clientAttendanceRate: 75, // 3/(3+1) * 100
        utilization: 60,
      });
    });
  });
});
