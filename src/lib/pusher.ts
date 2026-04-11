import PusherServer from 'pusher';

// ── Singleton ────────────────────────────────────────────────────────────────

let _pusher: PusherServer | null = null;

function getPusherServer(): PusherServer {
  if (_pusher) return _pusher;

  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) {
    throw new Error(
      `[Pusher] Missing env vars — PUSHER_APP_ID:${!!appId} PUSHER_KEY:${!!key} PUSHER_SECRET:${!!secret} PUSHER_CLUSTER:${!!cluster}`,
    );
  }

  _pusher = new PusherServer({ appId, key, secret, cluster, useTLS: true });
  return _pusher;
}

// ── Channel / event types (from api-contracts.md) ────────────────────────────

export type SessionChannel = `session-${string}`;
export type UserChannel = `user-${string}`;

export interface SessionStartedPayload {
  sessionId: string;
  startedAt: string; // ISO
  expectedDurationMin: number;
}

export interface SessionEndedPayload {
  sessionId: string;
  endedAt: string; // ISO
  actualDurationMin: number;
}

export interface NotificationPayload {
  id: string;
  title: string;
  body: string;
}

export interface LeaveStatusChangedPayload {
  leaveId: string;
  status: 'APPROVED' | 'REJECTED';
  notes?: string | null;
}

export interface TrainerReassignedPayload {
  sessionId: string;
  newTrainerName: string;
  date: string;
  time: string;
}

// ── Trigger helpers ──────────────────────────────────────────────────────────

/**
 * Trigger an event on a session channel.
 * Channel name: `session-{sessionId}` (hyphenated, not colon — Pusher doesn't allow colons)
 */
export async function triggerSessionEvent(
  sessionId: string,
  event: 'SESSION_STARTED' | 'SESSION_ENDED',
  payload: SessionStartedPayload | SessionEndedPayload,
) {
  const channel: SessionChannel = `session-${sessionId}`;
  try {
    await getPusherServer().trigger(channel, event, payload);
    console.log(`[Pusher] Triggered ${event} on ${channel}`);
  } catch (err) {
    console.error(`[Pusher] Failed to trigger ${event} on ${channel}:`, err);
  }
}

/**
 * Trigger an event on a user channel.
 * Channel name: `user-{userId}`
 */
export async function triggerUserEvent(
  userId: string,
  event: 'NOTIFICATION' | 'LEAVE_STATUS_CHANGED' | 'TRAINER_REASSIGNED',
  payload: NotificationPayload | LeaveStatusChangedPayload | TrainerReassignedPayload,
) {
  const channel: UserChannel = `user-${userId}`;
  try {
    await getPusherServer().trigger(channel, event, payload);
    console.log(`[Pusher] Triggered ${event} on ${channel}`);
  } catch (err) {
    console.error(`[Pusher] Failed to trigger ${event} on ${channel}:`, err);
  }
}
