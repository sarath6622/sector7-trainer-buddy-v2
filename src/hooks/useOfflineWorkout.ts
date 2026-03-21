'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  queueWorkoutEntry,
  getSessionWorkoutQueue,
  cacheExercises,
  searchCachedExercises,
  getCachedExercises,
  type OfflineWorkoutEntry,
  type CachedExercise,
  type OfflineSet,
} from '@/lib/offline-db';
import { syncPendingWorkouts, isOnline, type SyncResult } from '@/lib/offline-sync';

interface UseOfflineWorkoutOptions {
  sessionInstanceId: string;
  autoSync?: boolean;
}

export function useOfflineWorkout({
  sessionInstanceId,
  autoSync = true,
}: UseOfflineWorkoutOptions) {
  const [queue, setQueue] = useState<OfflineWorkoutEntry[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  // Track online/offline status
  useEffect(() => {
    setOnline(isOnline());

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load queue on mount
  const refreshQueue = useCallback(async () => {
    const entries = await getSessionWorkoutQueue(sessionInstanceId);
    setQueue(entries);
    setPendingCount(entries.filter((e) => e.syncStatus === 'pending').length);
  }, [sessionInstanceId]);

  useEffect(() => {
    refreshQueue();
  }, [refreshQueue]);

  // Add workout entry to offline queue
  const addWorkoutEntry = useCallback(
    async (entry: {
      exerciseId: string;
      exerciseName: string;
      orderIndex: number;
      sets: OfflineSet[];
    }) => {
      const localId = crypto.randomUUID();
      await queueWorkoutEntry({
        localId,
        sessionInstanceId,
        exerciseId: entry.exerciseId,
        exerciseName: entry.exerciseName,
        orderIndex: entry.orderIndex,
        sets: entry.sets,
        createdAt: new Date().toISOString(),
        syncStatus: 'pending',
      });
      await refreshQueue();
      return localId;
    },
    [sessionInstanceId, refreshQueue],
  );

  // Manual sync trigger
  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await syncPendingWorkouts();
      setLastSyncResult(result);
      await refreshQueue();
    } finally {
      setSyncing(false);
    }
  }, [syncing, refreshQueue]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (online && autoSync && pendingCount > 0 && !syncing) {
      sync();
    }
  }, [online, autoSync, pendingCount, syncing, sync]);

  return {
    queue,
    pendingCount,
    syncing,
    online,
    lastSyncResult,
    addWorkoutEntry,
    sync,
    refreshQueue,
  };
}

/**
 * Hook for managing cached exercise library
 */
export function useExerciseCache() {
  const [exercises, setExercises] = useState<CachedExercise[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFromCache = useCallback(async () => {
    setLoading(true);
    try {
      const cached = await getCachedExercises();
      setExercises(cached);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshFromServer = useCallback(async () => {
    try {
      const res = await fetch('/api/exercises');
      if (res.ok) {
        const { data } = await res.json();
        const now = new Date().toISOString();
        const toCache: CachedExercise[] = data.map((e: CachedExercise) => ({
          ...e,
          cachedAt: now,
        }));
        await cacheExercises(toCache);
        setExercises(toCache);
      }
    } catch {
      // Offline — fall back to cache
      await loadFromCache();
    }
  }, [loadFromCache]);

  const search = useCallback(async (query: string) => {
    if (!query) return getCachedExercises();
    return searchCachedExercises(query);
  }, []);

  useEffect(() => {
    // Try server first, fall back to cache
    refreshFromServer();
  }, [refreshFromServer]);

  return { exercises, loading, search, refresh: refreshFromServer };
}
