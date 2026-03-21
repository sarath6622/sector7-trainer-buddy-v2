import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  listAuditLogs,
  getDistinctActions,
  getDistinctSubjectTypes,
} from '@/services/auditlog.service';

const mockFindMany = prisma.auditLog.findMany as ReturnType<typeof vi.fn>;
const mockCount = prisma.auditLog.count as ReturnType<typeof vi.fn>;

const BRANCH = 'branch-1';

const sampleLog = {
  id: 'al-1',
  branchId: BRANCH,
  actorId: 'user-1',
  action: 'USER_CREATED',
  subjectType: 'User',
  subjectId: 'user-2',
  oldValue: null,
  newValue: { firstName: 'John' },
  metadata: null,
  createdAt: new Date('2026-03-15T10:00:00Z'),
  actor: {
    id: 'user-1',
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@test.com',
    role: 'BRANCH_ADMIN',
  },
};

describe('auditlog.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listAuditLogs', () => {
    it('should return paginated audit logs', async () => {
      mockFindMany.mockResolvedValue([sampleLog]);
      mockCount.mockResolvedValue(1);

      const result = await listAuditLogs({ branchId: BRANCH, page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ action: 'USER_CREATED', subjectType: 'User' });
      expect(result.pagination).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { branchId: BRANCH },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should filter by action', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await listAuditLogs({ branchId: BRANCH, action: 'USER_CREATED', page: 1, pageSize: 20 });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: 'USER_CREATED' }),
        }),
      );
    });

    it('should filter by date range', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await listAuditLogs({
        branchId: BRANCH,
        dateFrom: '2026-03-01',
        dateTo: '2026-03-31',
        page: 1,
        pageSize: 20,
      });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: new Date('2026-03-01'),
            }),
          }),
        }),
      );
    });

    it('should filter by subjectType and actorId', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(0);

      await listAuditLogs({
        branchId: BRANCH,
        subjectType: 'User',
        actorId: 'user-1',
        page: 1,
        pageSize: 20,
      });

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            subjectType: 'User',
            actorId: 'user-1',
          }),
        }),
      );
    });

    it('should calculate pagination correctly for page 2', async () => {
      mockFindMany.mockResolvedValue([]);
      mockCount.mockResolvedValue(50);

      const result = await listAuditLogs({ branchId: BRANCH, page: 2, pageSize: 20 });

      expect(result.pagination).toMatchObject({ page: 2, totalPages: 3, total: 50 });
      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }));
    });
  });

  describe('getDistinctActions', () => {
    it('should return distinct action types', async () => {
      mockFindMany.mockResolvedValue([
        { action: 'SESSION_STARTED' },
        { action: 'USER_CREATED' },
        { action: 'USER_UPDATED' },
      ]);

      const result = await getDistinctActions(BRANCH);

      expect(result).toEqual(['SESSION_STARTED', 'USER_CREATED', 'USER_UPDATED']);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { branchId: BRANCH },
          distinct: ['action'],
        }),
      );
    });
  });

  describe('getDistinctSubjectTypes', () => {
    it('should return distinct subject types', async () => {
      mockFindMany.mockResolvedValue([{ subjectType: 'SessionInstance' }, { subjectType: 'User' }]);

      const result = await getDistinctSubjectTypes(BRANCH);

      expect(result).toEqual(['SessionInstance', 'User']);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { branchId: BRANCH },
          distinct: ['subjectType'],
        }),
      );
    });
  });
});
