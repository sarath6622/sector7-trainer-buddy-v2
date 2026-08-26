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

// ─── Session Booking Notifications ─────────────────

export async function notifySessionBooked({
  branchId,
  clientUserId,
  trainerName,
  date,
  time,
}: {
  branchId: string;
  clientUserId: string;
  trainerName: string;
  date: string;
  time: string;
}) {
  try {
    await sendNotification({
      branchId,
      recipientId: clientUserId,
      title: 'Session scheduled',
      body: `${trainerName} • ${date} at ${time}`,
      channel: 'IN_APP',
      metadata: { type: 'SESSION_BOOKED' },
    });
  } catch (error) {
    console.error('[Notification] Failed to send session booked:', error);
  }
}

export async function notifyScheduleCreated({
  branchId,
  clientUserId,
  trainerName,
  dayOfWeek,
  startTime,
}: {
  branchId: string;
  clientUserId: string;
  trainerName: string;
  dayOfWeek: string;
  startTime: string;
}) {
  try {
    await sendNotification({
      branchId,
      recipientId: clientUserId,
      title: 'Recurring schedule set',
      body: `${trainerName} • ${dayOfWeek}s at ${startTime}`,
      channel: 'IN_APP',
      metadata: { type: 'SCHEDULE_CREATED' },
    });
  } catch (error) {
    console.error('[Notification] Failed to send schedule created:', error);
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

// ─── Session Overrun Notifications ──────────────────
//
// Sent by the `/api/cron/session-overrun-reminders` scan, not by a user
// action. Dedup is the caller's job: it reads back `notification_logs` and
// matches on `metadata.sessionInstanceId` + `metadata.stage`, so these
// functions must keep writing both fields (see `processOverrunReminders`).

/**
 * Nudge a trainer that a session is still IN_PROGRESS past its booked
 * duration. Stage 1 fires at the planned end, stage 2 fifteen minutes later.
 * Only the trainer is notified — they are the only role that can end a
 * session (`POST /api/trainer/sessions/[id]/end`).
 */
export async function notifySessionOverrun({
  branchId,
  trainerUserId,
  clientName,
  sessionInstanceId,
  openFor,
  stage,
}: {
  branchId: string;
  trainerUserId: string;
  clientName: string;
  sessionInstanceId: string;
  openFor: string;
  stage: 1 | 2;
}) {
  try {
    await sendNotification({
      branchId,
      recipientId: trainerUserId,
      title: stage === 1 ? 'Session still running' : 'Session still not ended',
      body:
        stage === 1
          ? `${clientName} • open for ${openFor} — tap to end it`
          : `${clientName} • still open after ${openFor} — please end the session`,
      channel: 'IN_APP',
      metadata: { type: 'SESSION_OVERRUN', sessionInstanceId, stage },
    });
  } catch (error) {
    console.error('[Notification] Failed to send session overrun:', error);
  }
}

/**
 * Tell the trainer their forgotten session was closed for them after 24h.
 * The recorded duration is the booked one, not measured — the body says so,
 * because the trainer may want to correct it.
 */
export async function notifySessionAutoClosed({
  branchId,
  trainerUserId,
  clientName,
  sessionInstanceId,
  durationMin,
}: {
  branchId: string;
  trainerUserId: string;
  clientName: string;
  sessionInstanceId: string;
  durationMin: number;
}) {
  try {
    await sendNotification({
      branchId,
      recipientId: trainerUserId,
      title: 'Session auto-closed',
      body: `${clientName} • left open over 24h — closed at the booked ${durationMin} min`,
      channel: 'IN_APP',
      metadata: { type: 'SESSION_AUTO_CLOSED', sessionInstanceId },
    });
  } catch (error) {
    console.error('[Notification] Failed to send session auto-closed:', error);
  }
}

/**
 * Give branch admins oversight of auto-closes — the recorded duration is a
 * fallback, so someone with edit rights should know it happened.
 */
export async function notifyAdminsSessionAutoClosed({
  branchId,
  adminUserIds,
  trainerName,
  clientName,
  sessionInstanceId,
  durationMin,
}: {
  branchId: string;
  adminUserIds: string[];
  trainerName: string;
  clientName: string;
  sessionInstanceId: string;
  durationMin: number;
}) {
  await Promise.allSettled(
    adminUserIds.map((recipientId) =>
      sendNotification({
        branchId,
        recipientId,
        title: 'Session auto-closed',
        body: `${trainerName} → ${clientName} • never ended — closed at the booked ${durationMin} min`,
        channel: 'IN_APP',
        metadata: { type: 'SESSION_AUTO_CLOSED', sessionInstanceId },
      }),
    ),
  );
}
