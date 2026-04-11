import { prisma } from '@/lib/prisma';
import type { NotificationChannel, NotificationStatus, Prisma } from '@prisma/client';
import { getFirebaseMessagingAdmin } from '@/lib/firebase-admin';
import { triggerUserEvent } from '@/lib/pusher';

// ─── Types ──────────────────────────────────────────

export interface SendNotificationInput {
  branchId: string;
  recipientId: string;
  title: string;
  body: string;
  channel?: NotificationChannel;
  metadata?: Prisma.InputJsonValue;
}

export interface NotificationProvider {
  send(input: {
    recipientId: string;
    title: string;
    body: string;
    metadata?: Prisma.InputJsonValue;
  }): Promise<{ success: boolean; error?: string }>;
}

// ─── Providers ──────────────────────────────────────

/**
 * WhatsApp Business API provider (stubbed).
 * Replace the send method with real API call when credentials are available.
 */
export const whatsAppProvider: NotificationProvider = {
  async send({ recipientId, title, body }) {
    // TODO: Integrate with WhatsApp Business API
    // For now, log and return success to allow development
    console.log(`[WhatsApp] To: ${recipientId} | ${title}: ${body}`);

    // Simulate: in production, check WHATSAPP_API_KEY env var
    if (!process.env.WHATSAPP_API_KEY) {
      return { success: false, error: 'WhatsApp API key not configured' };
    }

    return { success: true };
  },
};

/**
 * Firebase Cloud Messaging provider (stubbed).
 * Replace the send method with real FCM call when credentials are available.
 */
export const fcmProvider: NotificationProvider = {
  async send({ recipientId, title, body }) {
    // TODO: Integrate with Firebase Admin SDK
    console.log(`[FCM] To: ${recipientId} | ${title}: ${body}`);

    if (!process.env.FCM_SERVER_KEY) {
      return { success: false, error: 'FCM server key not configured' };
    }

    return { success: true };
  },
};

/**
 * In-app notification provider — always succeeds.
 * Creates the DB record (handled by the service), so this is a no-op send.
 */
export const inAppProvider: NotificationProvider = {
  async send() {
    return { success: true };
  },
};

// ─── Service Functions ──────────────────────────────

/**
 * Send a notification with fallback logic:
 * - WHATSAPP → attempt WhatsApp, fallback to IN_APP on failure
 * - BOTH → attempt WhatsApp + in-app
 * - IN_APP → in-app only
 *
 * Every attempt is logged to NotificationLog regardless of outcome.
 */
export async function sendNotification({
  branchId,
  recipientId,
  title,
  body,
  channel = 'IN_APP',
  metadata,
}: SendNotificationInput) {
  if (channel === 'WHATSAPP' || channel === 'BOTH') {
    // Try WhatsApp first
    const waResult = await whatsAppProvider.send({ recipientId, title, body, metadata });

    await prisma.notificationLog.create({
      data: {
        branchId,
        recipientId,
        channel: 'WHATSAPP',
        status: waResult.success ? 'SENT' : 'FAILED',
        title,
        body,
        metadata: metadata ?? undefined,
        sentAt: waResult.success ? new Date() : null,
        failReason: waResult.error ?? null,
      },
    });

    // If WhatsApp failed or channel is BOTH, also send in-app
    if (!waResult.success || channel === 'BOTH') {
      await createInAppNotification({ branchId, recipientId, title, body, metadata });
    }

    return;
  }

  // IN_APP only
  await createInAppNotification({ branchId, recipientId, title, body, metadata });
}

async function createInAppNotification({
  branchId,
  recipientId,
  title,
  body,
  metadata,
}: Omit<SendNotificationInput, 'channel'>) {
  const log = await prisma.notificationLog.create({
    data: {
      branchId,
      recipientId,
      channel: 'IN_APP',
      status: 'SENT',
      title,
      body,
      metadata: metadata ?? undefined,
      sentAt: new Date(),
    },
  });

  // Pusher: push NOTIFICATION event to the recipient's user channel (real-time in-app bell)
  void triggerUserEvent(recipientId, 'NOTIFICATION', {
    id: log.id,
    title,
    body,
  }).catch((err) => {
    console.error('[Pusher] Failed to trigger NOTIFICATION event:', err);
  });

  // Send FCM push to all registered devices for this user
  void sendFcmPush({ recipientId, title, body }).catch((err) => {
    console.error('[FCM Push] Unhandled error in sendFcmPush:', err);
  });
}

const FCM_TAG = '[FCM Push]';

async function sendFcmPush({
  recipientId,
  title,
  body,
}: {
  recipientId: string;
  title: string;
  body: string;
}) {
  const hasProjectId = !!process.env.FIREBASE_PROJECT_ID;
  const hasPrivateKey = !!process.env.FIREBASE_PRIVATE_KEY;

  if (!hasProjectId || !hasPrivateKey) {
    console.warn(`${FCM_TAG} Skipped — env vars missing:`, {
      FIREBASE_PROJECT_ID: hasProjectId ? '✓' : '✗ MISSING',
      FIREBASE_PRIVATE_KEY: hasPrivateKey ? '✓' : '✗ MISSING',
    });
    return;
  }

  const tokens = await prisma.fcmToken.findMany({
    where: { userId: recipientId },
    select: { token: true },
  });

  console.log(`${FCM_TAG} Sending to user ${recipientId} — ${tokens.length} device token(s) found`);

  if (tokens.length === 0) {
    console.warn(`${FCM_TAG} No FCM tokens registered for user ${recipientId} — push skipped`);
    return;
  }

  try {
    const messaging = getFirebaseMessagingAdmin();
    const result = await messaging.sendEachForMulticast({
      tokens: tokens.map((t) => t.token),
      notification: { title, body },
      webpush: {
        notification: {
          title,
          body,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-72x72.png',
        },
        fcmOptions: { link: '/' },
      },
    });

    console.log(
      `${FCM_TAG} Multicast result — successCount: ${result.successCount}, failureCount: ${result.failureCount}`,
    );

    result.responses.forEach((resp, i) => {
      if (!resp.success) {
        console.error(`${FCM_TAG} Token[${i}] failed:`, resp.error?.code, resp.error?.message);
      }
    });
  } catch (err) {
    console.error(`${FCM_TAG} sendEachForMulticast threw an error:`, err);
  }
}

/**
 * Get notifications for a user with optional unread filter.
 */
export async function getNotifications({
  recipientId,
  branchId,
  unreadOnly = false,
  page = 1,
  pageSize = 20,
}: {
  recipientId: string;
  branchId: string;
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const where = {
    recipientId,
    branchId,
    channel: 'IN_APP' as NotificationChannel,
    status: 'SENT' as NotificationStatus,
    ...(unreadOnly ? { readAt: null } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.notificationLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notificationLog.count({ where }),
  ]);

  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Get unread notification count.
 */
export async function getUnreadCount({
  recipientId,
  branchId,
}: {
  recipientId: string;
  branchId: string;
}) {
  return prisma.notificationLog.count({
    where: {
      recipientId,
      branchId,
      channel: 'IN_APP',
      status: 'SENT',
      readAt: null,
    },
  });
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead({
  notificationId,
  recipientId,
  branchId,
}: {
  notificationId: string;
  recipientId: string;
  branchId: string;
}) {
  const notification = await prisma.notificationLog.findFirst({
    where: { id: notificationId, recipientId, branchId },
  });

  if (!notification) {
    return null;
  }

  return prisma.notificationLog.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead({
  recipientId,
  branchId,
}: {
  recipientId: string;
  branchId: string;
}) {
  return prisma.notificationLog.updateMany({
    where: {
      recipientId,
      branchId,
      channel: 'IN_APP',
      readAt: null,
    },
    data: { readAt: new Date() },
  });
}
