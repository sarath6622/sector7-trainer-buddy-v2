import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    notificationLog: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  sendNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from '@/lib/notifications';

const BRANCH = 'branch-1';
const USER = 'user-1';

const create = prisma.notificationLog.create as ReturnType<typeof vi.fn>;
const findMany = prisma.notificationLog.findMany as ReturnType<typeof vi.fn>;
const findFirst = prisma.notificationLog.findFirst as ReturnType<typeof vi.fn>;
const update = prisma.notificationLog.update as ReturnType<typeof vi.fn>;
const updateMany = prisma.notificationLog.updateMany as ReturnType<typeof vi.fn>;
const count = prisma.notificationLog.count as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WHATSAPP_API_KEY;
  delete process.env.FCM_SERVER_KEY;
});

// ─── sendNotification ─────────────────────────────

describe('sendNotification', () => {
  it('should create IN_APP notification for default channel', async () => {
    create.mockResolvedValue({});

    await sendNotification({
      branchId: BRANCH,
      recipientId: USER,
      title: 'Test',
      body: 'Test body',
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        branchId: BRANCH,
        recipientId: USER,
        channel: 'IN_APP',
        status: 'SENT',
        title: 'Test',
        body: 'Test body',
      }),
    });
  });

  it('should fallback to IN_APP when WhatsApp fails (no API key)', async () => {
    create.mockResolvedValue({});

    await sendNotification({
      branchId: BRANCH,
      recipientId: USER,
      title: 'Test',
      body: 'Body',
      channel: 'WHATSAPP',
    });

    // First call: WhatsApp FAILED log, second call: IN_APP fallback
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        channel: 'WHATSAPP',
        status: 'FAILED',
        failReason: 'WhatsApp API key not configured',
      }),
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        channel: 'IN_APP',
        status: 'SENT',
      }),
    });
  });

  it('should send both WhatsApp and IN_APP for BOTH channel', async () => {
    process.env.WHATSAPP_API_KEY = 'test-key';
    create.mockResolvedValue({});

    await sendNotification({
      branchId: BRANCH,
      recipientId: USER,
      title: 'Test',
      body: 'Body',
      channel: 'BOTH',
    });

    // WhatsApp SENT + IN_APP SENT
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ channel: 'WHATSAPP', status: 'SENT' }),
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ channel: 'IN_APP', status: 'SENT' }),
    });
  });
});

// ─── getNotifications ─────────────────────────────

describe('getNotifications', () => {
  it('should return paginated notifications', async () => {
    const mockData = [{ id: 'n-1', title: 'Test', body: 'Body', createdAt: new Date() }];
    findMany.mockResolvedValue(mockData);
    count.mockResolvedValue(1);

    const result = await getNotifications({
      recipientId: USER,
      branchId: BRANCH,
    });

    expect(result.data).toEqual(mockData);
    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('should filter unread only when specified', async () => {
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);

    await getNotifications({
      recipientId: USER,
      branchId: BRANCH,
      unreadOnly: true,
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ readAt: null }),
      }),
    );
  });
});

// ─── getUnreadCount ───────────────────────────────

describe('getUnreadCount', () => {
  it('should return count of unread IN_APP notifications', async () => {
    count.mockResolvedValue(5);

    const result = await getUnreadCount({ recipientId: USER, branchId: BRANCH });

    expect(result).toBe(5);
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        recipientId: USER,
        branchId: BRANCH,
        channel: 'IN_APP',
        readAt: null,
      }),
    });
  });
});

// ─── markAsRead ───────────────────────────────────

describe('markAsRead', () => {
  it('should return null if notification not found', async () => {
    findFirst.mockResolvedValue(null);

    const result = await markAsRead({
      notificationId: 'n-999',
      recipientId: USER,
      branchId: BRANCH,
    });

    expect(result).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('should update readAt on found notification', async () => {
    findFirst.mockResolvedValue({ id: 'n-1', recipientId: USER });
    const updated = { id: 'n-1', readAt: new Date() };
    update.mockResolvedValue(updated);

    const result = await markAsRead({
      notificationId: 'n-1',
      recipientId: USER,
      branchId: BRANCH,
    });

    expect(result).toEqual(updated);
    expect(update).toHaveBeenCalledWith({
      where: { id: 'n-1' },
      data: { readAt: expect.any(Date) },
    });
  });
});

// ─── markAllAsRead ────────────────────────────────

describe('markAllAsRead', () => {
  it('should update all unread IN_APP notifications', async () => {
    updateMany.mockResolvedValue({ count: 3 });

    const result = await markAllAsRead({ recipientId: USER, branchId: BRANCH });

    expect(result.count).toBe(3);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        recipientId: USER,
        branchId: BRANCH,
        channel: 'IN_APP',
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
  });
});
