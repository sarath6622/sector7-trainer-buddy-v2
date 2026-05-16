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
export type BranchChannel = `branch-${string}`;

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

export interface RestTimerEventPayload {
  endTime: number | null;
  pausedRemaining: number | null;
  total: number | null;
  updatedAt: number;
  serverNow: number;
}

export interface SessionPauseEventPayload {
  pausedAt: number | null; // ms since epoch — null = currently running
  accumulatedPausedSec: number;
  updatedAt: number; // pauseUpdatedAt — dedicated monotonic stamp
  serverNow: number;
}

export interface WorkoutUpdatedPayload {
  sessionId: string;
  actorUserId: string; // writer's user id — receivers ignore self-echo
  updatedAt: number; // ms since epoch
}

// Compound slot key understood by the TV's rotation deck. `null` = the PR's
// exercise doesn't match any of the four displayed compound leaderboards
// (e.g. accessory lift) — the TV refetches but does not jump.
export type CompoundSlotKey = 'bench' | 'squat' | 'deadlift' | 'ohp' | null;

export interface PrCelebratedPayload {
  clientProfileId: string;
  clientName: string;
  profileImageUrl: string | null;
  exerciseId: string;
  exerciseName: string;
  slotKey: CompoundSlotKey;
  weightKg: number;
  reps: number | null;
  achievedAt: string; // ISO
}

export interface LeaderboardChangedPayload {
  slotKey: CompoundSlotKey;
  exerciseId: string;
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
 * Trigger a rest-timer change on a session channel. Replaces the 1-Hz poll —
 * subscribers re-render off the pushed payload and run their countdown
 * locally. Pusher payloads are size-capped (~10KB), so the slim shape here is
 * deliberate.
 */
export async function triggerRestTimerEvent(sessionId: string, payload: RestTimerEventPayload) {
  const channel: SessionChannel = `session-${sessionId}`;
  try {
    await getPusherServer().trigger(channel, 'REST_TIMER_UPDATED', payload);
  } catch (err) {
    console.error(`[Pusher] Failed to trigger REST_TIMER_UPDATED on ${channel}:`, err);
  }
}

/**
 * Broadcast a session pause/resume to the session channel. Both trainer and
 * client subscribe; whoever's looking at the session sees the same paused
 * state with the same elapsed offset.
 */
export async function triggerSessionPauseEvent(
  sessionId: string,
  payload: SessionPauseEventPayload,
) {
  const channel: SessionChannel = `session-${sessionId}`;
  try {
    await getPusherServer().trigger(channel, 'SESSION_PAUSE_UPDATED', payload);
  } catch (err) {
    console.error(`[Pusher] Failed to trigger SESSION_PAUSE_UPDATED on ${channel}:`, err);
  }
}

/**
 * Notify peers that the session's workout log changed.
 * Receivers (trainer + client session pages) refetch the session to pick
 * up the new state. The actorUserId lets each subscriber skip the echo of
 * its own save.
 */
export async function triggerWorkoutUpdatedEvent(
  sessionId: string,
  payload: WorkoutUpdatedPayload,
) {
  const channel: SessionChannel = `session-${sessionId}`;
  try {
    await getPusherServer().trigger(channel, 'WORKOUT_UPDATED', payload);
  } catch (err) {
    console.error(`[Pusher] Failed to trigger WORKOUT_UPDATED on ${channel}:`, err);
  }
}

/**
 * Broadcast a fresh compound PR to the gym TV. Channel `branch-{branchId}` was
 * retired by ADR-033 and re-introduced with narrower scope by ADR-038 — only
 * compound-PR celebration and the leaderboard-jump nudge ride this channel.
 * Best-effort: a Pusher failure must never block the underlying workout save.
 */
export async function triggerPrCelebrated(branchId: string, payload: PrCelebratedPayload) {
  const channel: BranchChannel = `branch-${branchId}`;
  try {
    await getPusherServer().trigger(channel, 'PR_CELEBRATED', payload);
  } catch (err) {
    console.error(`[Pusher] Failed to trigger PR_CELEBRATED on ${channel}:`, err);
  }
}

/**
 * Nudge the TV that a compound leaderboard's top-N has been disturbed by a
 * fresh PR. The TV refetches the dashboard and (if the slot is currently in
 * its rotation deck) jumps straight to that panel before resuming the cycle.
 */
export async function triggerLeaderboardChanged(
  branchId: string,
  payload: LeaderboardChangedPayload,
) {
  const channel: BranchChannel = `branch-${branchId}`;
  try {
    await getPusherServer().trigger(channel, 'LEADERBOARD_CHANGED', payload);
  } catch (err) {
    console.error(`[Pusher] Failed to trigger LEADERBOARD_CHANGED on ${channel}:`, err);
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
