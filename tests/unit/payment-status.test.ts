import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clientProfile: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { updatePaymentStatus } from '@/services/user.service';

const mockFindFirst = prisma.clientProfile.findFirst as ReturnType<typeof vi.fn>;
const mockUpdate = prisma.clientProfile.update as ReturnType<typeof vi.fn>;
const mockAudit = auditLog as ReturnType<typeof vi.fn>;

const BRANCH = 'branch-1';
const ACTOR = 'admin-1';
const CLIENT_PROFILE_ID = 'cp-1';

describe('updatePaymentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should toggle payment status from PENDING to PAID', async () => {
    mockFindFirst.mockResolvedValue({
      id: CLIENT_PROFILE_ID,
      paymentStatus: 'PENDING',
      userId: 'user-1',
    });
    mockUpdate.mockResolvedValue({
      id: CLIENT_PROFILE_ID,
      paymentStatus: 'PAID',
    });

    const result = await updatePaymentStatus(CLIENT_PROFILE_ID, 'PAID', BRANCH, ACTOR);

    expect(result.paymentStatus).toBe('PAID');
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: CLIENT_PROFILE_ID },
      data: { paymentStatus: 'PAID' },
    });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PAYMENT_STATUS_UPDATED',
        oldValue: { paymentStatus: 'PENDING' },
        newValue: { paymentStatus: 'PAID' },
      }),
    );
  });

  it('should toggle payment status from PAID to PENDING', async () => {
    mockFindFirst.mockResolvedValue({
      id: CLIENT_PROFILE_ID,
      paymentStatus: 'PAID',
      userId: 'user-1',
    });
    mockUpdate.mockResolvedValue({
      id: CLIENT_PROFILE_ID,
      paymentStatus: 'PENDING',
    });

    const result = await updatePaymentStatus(CLIENT_PROFILE_ID, 'PENDING', BRANCH, ACTOR);

    expect(result.paymentStatus).toBe('PENDING');
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValue: { paymentStatus: 'PAID' },
        newValue: { paymentStatus: 'PENDING' },
      }),
    );
  });

  it('should throw NOT_FOUND if client profile does not exist', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(updatePaymentStatus(CLIENT_PROFILE_ID, 'PAID', BRANCH, ACTOR)).rejects.toThrow(
      'Client not found',
    );

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it('should scope query to branchId', async () => {
    mockFindFirst.mockResolvedValue({
      id: CLIENT_PROFILE_ID,
      paymentStatus: 'PENDING',
      userId: 'user-1',
    });
    mockUpdate.mockResolvedValue({ id: CLIENT_PROFILE_ID, paymentStatus: 'PAID' });

    await updatePaymentStatus(CLIENT_PROFILE_ID, 'PAID', BRANCH, ACTOR);

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { id: CLIENT_PROFILE_ID, branchId: BRANCH },
      select: { id: true, paymentStatus: true, userId: true },
    });
  });
});
