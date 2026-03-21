import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    branchSettings: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { getSettings, updateSettings } from '@/services/settings.service';

const mockFindUnique = prisma.branchSettings.findUnique as ReturnType<typeof vi.fn>;
const mockCreate = prisma.branchSettings.create as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.branchSettings.update as ReturnType<typeof vi.fn>;
const mockAudit = auditLog as ReturnType<typeof vi.fn>;

const BRANCH = 'branch-1';
const ACTOR = 'admin-1';

const defaultSettings = {
  id: 'bs-1',
  branchId: BRANCH,
  defaultSessionDurationMin: 60,
  carryForwardLimit: 3,
  cancellationPolicyEnabled: false,
  cancellationWindowMin: 120,
  reminderTimingMin: 60,
  noShowThresholdMin: 15,
  kickboxingClassSizeLimit: 20,
};

describe('settings.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should return existing settings', async () => {
      mockFindUnique.mockResolvedValue(defaultSettings);

      const result = await getSettings(BRANCH);

      expect(result).toEqual(defaultSettings);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should create default settings if none exist', async () => {
      mockFindUnique.mockResolvedValue(null);
      mockCreate.mockResolvedValue(defaultSettings);

      const result = await getSettings(BRANCH);

      expect(result).toEqual(defaultSettings);
      expect(mockCreate).toHaveBeenCalledWith({
        data: { branchId: BRANCH },
      });
    });
  });

  describe('updateSettings', () => {
    it('should update settings and audit log old → new values', async () => {
      mockFindUnique.mockResolvedValue(defaultSettings);
      const updated = { ...defaultSettings, carryForwardLimit: 5 };
      mockUpdate.mockResolvedValue(updated);

      const result = await updateSettings(BRANCH, { carryForwardLimit: 5 }, ACTOR);

      expect(result.carryForwardLimit).toBe(5);
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { branchId: BRANCH },
        data: { carryForwardLimit: 5 },
      });
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SETTINGS_UPDATED',
          oldValue: expect.objectContaining({ carryForwardLimit: 3 }),
          newValue: expect.objectContaining({ carryForwardLimit: 5 }),
        }),
      );
    });

    it('should update multiple fields at once', async () => {
      mockFindUnique.mockResolvedValue(defaultSettings);
      const updated = {
        ...defaultSettings,
        defaultSessionDurationMin: 45,
        cancellationPolicyEnabled: true,
        cancellationWindowMin: 60,
      };
      mockUpdate.mockResolvedValue(updated);

      const result = await updateSettings(
        BRANCH,
        {
          defaultSessionDurationMin: 45,
          cancellationPolicyEnabled: true,
          cancellationWindowMin: 60,
        },
        ACTOR,
      );

      expect(result.defaultSessionDurationMin).toBe(45);
      expect(result.cancellationPolicyEnabled).toBe(true);
      expect(result.cancellationWindowMin).toBe(60);
    });

    it('should skip update if no fields provided', async () => {
      mockFindUnique.mockResolvedValue(defaultSettings);

      const result = await updateSettings(BRANCH, {}, ACTOR);

      expect(result).toEqual(defaultSettings);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockAudit).not.toHaveBeenCalled();
    });

    it('should create settings first if they do not exist', async () => {
      // First call in getSettings returns null, triggers create
      mockFindUnique.mockResolvedValueOnce(null);
      mockCreate.mockResolvedValue(defaultSettings);
      const updated = { ...defaultSettings, noShowThresholdMin: 10 };
      mockUpdate.mockResolvedValue(updated);

      const result = await updateSettings(BRANCH, { noShowThresholdMin: 10 }, ACTOR);

      expect(mockCreate).toHaveBeenCalled();
      expect(result.noShowThresholdMin).toBe(10);
    });
  });
});
