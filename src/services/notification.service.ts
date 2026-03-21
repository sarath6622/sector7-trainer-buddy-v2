import { sendNotification } from '@/lib/notifications';

/**
 * Notification trigger functions called from existing services.
 * Each function sends a contextual notification without blocking the caller.
 * Failures are logged but never thrown — notifications must not break business logic.
 */

// ─── Session Notifications ──────────────────────────

export async function notifySessionStarted({
  branchId,
  clientUserId,
  trainerName,
  scheduledTime,
}: {
  branchId: string;
  clientUserId: string;
  trainerName: string;
  scheduledTime: string;
}) {
  try {
    await sendNotification({
      branchId,
      recipientId: clientUserId,
      title: 'Session Started',
      body: `Your session with ${trainerName} at ${scheduledTime} has started.`,
      channel: 'IN_APP',
      metadata: { type: 'SESSION_STARTED' },
    });
  } catch (error) {
    console.error('[Notification] Failed to send session started:', error);
  }
}

export async function notifyNoShow({
  branchId,
  clientUserId,
  date,
  time,
}: {
  branchId: string;
  clientUserId: string;
  date: string;
  time: string;
}) {
  try {
    await sendNotification({
      branchId,
      recipientId: clientUserId,
      title: 'Session Marked No-Show',
      body: `Your session on ${date} at ${time} was marked as no-show.`,
      channel: 'BOTH',
      metadata: { type: 'NO_SHOW' },
    });
  } catch (error) {
    console.error('[Notification] Failed to send no-show:', error);
  }
}

// ─── Leave Notifications ────────────────────────────

export async function notifyLeaveApproved({
  branchId,
  trainerUserId,
  startDate,
  endDate,
}: {
  branchId: string;
  trainerUserId: string;
  startDate: string;
  endDate: string;
}) {
  try {
    await sendNotification({
      branchId,
      recipientId: trainerUserId,
      title: 'Leave Approved',
      body: `Your leave from ${startDate} to ${endDate} has been approved.`,
      channel: 'BOTH',
      metadata: { type: 'LEAVE_APPROVED' },
    });
  } catch (error) {
    console.error('[Notification] Failed to send leave approved:', error);
  }
}

export async function notifyLeaveRejected({
  branchId,
  trainerUserId,
  startDate,
  endDate,
  notes,
}: {
  branchId: string;
  trainerUserId: string;
  startDate: string;
  endDate: string;
  notes?: string;
}) {
  try {
    await sendNotification({
      branchId,
      recipientId: trainerUserId,
      title: 'Leave Rejected',
      body: `Your leave from ${startDate} to ${endDate} was rejected.${notes ? ` Reason: ${notes}` : ''}`,
      channel: 'BOTH',
      metadata: { type: 'LEAVE_REJECTED' },
    });
  } catch (error) {
    console.error('[Notification] Failed to send leave rejected:', error);
  }
}

// ─── Reassignment Notifications ─────────────────────

export async function notifyReassignment({
  branchId,
  clientUserId,
  originalTrainerName,
  newTrainerName,
  date,
  time,
}: {
  branchId: string;
  clientUserId: string;
  originalTrainerName: string;
  newTrainerName: string;
  date: string;
  time: string;
}) {
  try {
    await sendNotification({
      branchId,
      recipientId: clientUserId,
      title: 'Trainer Reassigned',
      body: `Your session on ${date} at ${time} has been reassigned from ${originalTrainerName} to ${newTrainerName}.`,
      channel: 'BOTH',
      metadata: { type: 'TRAINER_REASSIGNED' },
    });
  } catch (error) {
    console.error('[Notification] Failed to send reassignment:', error);
  }
}

// ─── Generic Notification ───────────────────────────

export async function notifyUser({
  branchId,
  recipientId,
  title,
  body,
  channel = 'IN_APP',
  metadata,
}: {
  branchId: string;
  recipientId: string;
  title: string;
  body: string;
  channel?: 'WHATSAPP' | 'IN_APP' | 'BOTH';
  metadata?: Record<string, string>;
}) {
  try {
    await sendNotification({ branchId, recipientId, title, body, channel, metadata });
  } catch (error) {
    console.error('[Notification] Failed to send notification:', error);
  }
}
