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
      title: 'Session in progress',
      body: `${trainerName} • ${scheduledTime}`,
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
      title: 'Session missed',
      body: `${date} at ${time} — marked no-show`,
      channel: 'BOTH',
      metadata: { type: 'NO_SHOW' },
    });
  } catch (error) {
    console.error('[Notification] Failed to send no-show:', error);
  }
}

// ─── Leave Notifications ────────────────────────────

export async function notifyAdminsLeaveRequested({
  branchId,
  adminUserIds,
  trainerName,
  startDate,
  endDate,
  leaveId,
  leaveType,
}: {
  branchId: string;
  adminUserIds: string[];
  trainerName: string;
  startDate: string;
  endDate: string;
  leaveId: string;
  leaveType: string;
}) {
  const typeLabel =
    leaveType === 'HALF_DAY_AM'
      ? 'Half Day AM'
      : leaveType === 'HALF_DAY_PM'
        ? 'Half Day PM'
        : leaveType === 'CUSTOM'
          ? 'Custom Hours'
          : 'Full Day';

  const dateRange = startDate === endDate ? startDate : `${startDate} to ${endDate}`;

  await Promise.allSettled(
    adminUserIds.map((recipientId) =>
      sendNotification({
        branchId,
        recipientId,
        title: `Leave request — ${trainerName}`,
        body: `${typeLabel} • ${dateRange}`,
        channel: 'IN_APP',
        metadata: { type: 'LEAVE_REQUESTED', leaveId },
      }),
    ),
  );
}

export async function notifyClientsTrainerOnLeave({
  branchId,
  clientUserIds,
  trainerName,
  startDate,
  endDate,
}: {
  branchId: string;
  clientUserIds: string[];
  trainerName: string;
  startDate: string;
  endDate: string;
}) {
  await Promise.allSettled(
    clientUserIds.map((recipientId) =>
      sendNotification({
        branchId,
        recipientId,
        title: `${trainerName} is on leave`,
        body: `${startDate} – ${endDate} • A replacement will be arranged`,
        channel: 'BOTH',
        metadata: { type: 'TRAINER_ON_LEAVE' },
      }),
    ),
  );
}

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
      title: 'Leave approved',
      body: `${startDate} – ${endDate}`,
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
      title: 'Leave not approved',
      body: `${startDate} – ${endDate}${notes ? ` • ${notes}` : ''}`,
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
      title: `Trainer change — ${date}`,
      body: `${originalTrainerName} → ${newTrainerName} • ${time}`,
      channel: 'BOTH',
      metadata: { type: 'TRAINER_REASSIGNED' },
    });
  } catch (error) {
    console.error('[Notification] Failed to send reassignment:', error);
  }
}

export async function notifyTrainerNewAssignment({
  branchId,
  trainerUserId,
  clientName,
  date,
  time,
}: {
  branchId: string;
  trainerUserId: string;
  clientName: string;
  date: string;
  time: string;
}) {
  try {
    await sendNotification({
      branchId,
      recipientId: trainerUserId,
      title: `New session — ${clientName}`,
      body: `${date} • ${time}`,
      channel: 'BOTH',
      metadata: { type: 'SESSION_ASSIGNED' },
    });
  } catch (error) {
    console.error('[Notification] Failed to send trainer assignment:', error);
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
