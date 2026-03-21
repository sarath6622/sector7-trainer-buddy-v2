'use client';

import {
  getPendingWorkouts,
  markWorkoutSynced,
  markWorkoutFailed,
  clearSyncedWorkouts,
  type OfflineWorkoutEntry,
} from './offline-db';

export interface SyncResult {
  synced: number;
  failed: number;
  errors: { localId: string; error: string }[];
}

/**
 * Sync all pending offline workouts to the server.
 * Groups entries by sessionInstanceId for batch submission.
 */
export async function syncPendingWorkouts(): Promise<SyncResult> {
  const pending = await getPendingWorkouts();
  if (pending.length === 0) return { synced: 0, failed: 0, errors: [] };

  // Group by sessionInstanceId
  const grouped = new Map<string, OfflineWorkoutEntry[]>();
  for (const entry of pending) {
    const group = grouped.get(entry.sessionInstanceId) || [];
    group.push(entry);
    grouped.set(entry.sessionInstanceId, group);
  }

  let synced = 0;
  let failed = 0;
  const errors: { localId: string; error: string }[] = [];

  for (const [sessionInstanceId, entries] of grouped) {
    try {
      const res = await fetch('/api/trainer/workouts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionInstanceId,
          logs: entries.map((e) => ({
            localId: e.localId,
            exerciseId: e.exerciseId,
            orderIndex: e.orderIndex,
            sets: e.sets,
            createdAt: e.createdAt,
          })),
        }),
      });

      if (res.ok) {
        for (const entry of entries) {
          await markWorkoutSynced(entry.localId);
          synced++;
        }
      } else {
        const errBody = await res.json().catch(() => ({ error: 'Sync failed' }));
        for (const entry of entries) {
          const errMsg = errBody.error || `HTTP ${res.status}`;
          await markWorkoutFailed(entry.localId, errMsg);
          errors.push({ localId: entry.localId, error: errMsg });
          failed++;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Network error';
      for (const entry of entries) {
        await markWorkoutFailed(entry.localId, errMsg);
        errors.push({ localId: entry.localId, error: errMsg });
        failed++;
      }
    }
  }

  // Cleanup old synced entries
  await clearSyncedWorkouts();

  return { synced, failed, errors };
}

/**
 * Check if we're online
 */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
