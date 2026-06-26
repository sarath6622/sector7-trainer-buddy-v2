'use client';

/**
 * Durable, synchronous outbox for in-progress workout edits.
 *
 * The WorkoutLogger auto-saves on a 5s debounce and flushes a `keepalive` POST
 * when the app is backgrounded. Both can lose data: the OS can freeze/kill a
 * backgrounded PWA before the keepalive sends, and a fire-and-forget POST that
 * hits an expired session (401) drops the write silently. When that happens the
 * sets the user just typed never reach the DB — gone after a cold-start +
 * re-login (the reported production bug: client logs a few sets, backgrounds
 * the app, is forced to re-login, and the last sets are missing for both the
 * client and the trainer).
 *
 * This outbox is the safety net. The latest unsaved payload is mirrored to
 * localStorage *synchronously* on every change and again at teardown.
 * localStorage writes are synchronous (unlike IndexedDB/Dexie), so they survive
 * `freeze`/`pagehide` far more reliably than an async transaction. On the next
 * mount or reconnect the WorkoutLogger replays whatever is still here and
 * clears it once the server confirms.
 *
 * Scope: one entry per `sessionInstanceId`, so a device can hold drafts for
 * more than one concurrent session without collision.
 */

const PREFIX = 'sector7:workout-outbox:';
const keyFor = (sessionId: string) => `${PREFIX}${sessionId}`;

export interface OutboxRecord<T> {
  exercises: T[];
  /** epoch ms of the last write — used for debugging / staleness checks. */
  ts: number;
}

/**
 * Mirror the current unsaved payload to disk. Best-effort: never throws (a
 * quota error or private-browsing rejection must not break logging — the
 * in-memory POST path still runs).
 */
export function writeOutbox<T>(sessionId: string, exercises: T[]): void {
  if (typeof window === 'undefined' || !sessionId) return;
  try {
    const record: OutboxRecord<T> = { exercises, ts: Date.now() };
    window.localStorage.setItem(keyFor(sessionId), JSON.stringify(record));
  } catch {
    /* private mode / quota — nothing actionable; the live POST path remains */
  }
}

/** Read a stored payload, or `null` if absent or unreadable. */
export function readOutbox<T>(sessionId: string): OutboxRecord<T> | null {
  if (typeof window === 'undefined' || !sessionId) return null;
  try {
    const raw = window.localStorage.getItem(keyFor(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OutboxRecord<T>;
    if (!parsed || !Array.isArray(parsed.exercises)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Drop the stored payload once the server has confirmed the data. */
export function clearOutbox(sessionId: string): void {
  if (typeof window === 'undefined' || !sessionId) return;
  try {
    window.localStorage.removeItem(keyFor(sessionId));
  } catch {
    /* ignore */
  }
}
