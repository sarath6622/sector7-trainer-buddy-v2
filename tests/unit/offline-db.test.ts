import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {
  offlineDb,
  queueWorkoutEntry,
  getPendingWorkouts,
  markWorkoutSynced,
  markWorkoutFailed,
  getSessionWorkoutQueue,
  clearSyncedWorkouts,
  cacheExercises,
  getCachedExercises,
  searchCachedExercises,
  saveSessionState,
  getActiveSessionState,
  clearSessionState,
  type CachedExercise,
} from '@/lib/offline-db';

let counter = 0;
function uniqueId() {
  return `test-${Date.now()}-${++counter}`;
}

describe('offline-db', () => {
  beforeEach(async () => {
    // Use Dexie's built-in delete to fully reset
    await Dexie.delete('sector7-offline');
    await offlineDb.open();
  });

  afterEach(async () => {
    offlineDb.close();
  });

  describe('workout queue', () => {
    it('should queue and retrieve pending workouts', async () => {
      const localId = uniqueId();
      await queueWorkoutEntry({
        localId,
        sessionInstanceId: 'session-1',
        exerciseId: 'ex-1',
        exerciseName: 'Bench Press',
        orderIndex: 0,
        sets: [{ setNumber: 1, reps: 10, weightKg: 60 }],
        createdAt: new Date().toISOString(),
        syncStatus: 'pending',
      });

      const pending = await getPendingWorkouts();
      expect(pending).toHaveLength(1);
      expect(pending[0]!.localId).toBe(localId);
      expect(pending[0]!.syncStatus).toBe('pending');
    });

    it('should mark workout as synced', async () => {
      const localId = uniqueId();
      await queueWorkoutEntry({
        localId,
        sessionInstanceId: 'session-1',
        exerciseId: 'ex-1',
        exerciseName: 'Bench Press',
        orderIndex: 0,
        sets: [{ setNumber: 1, reps: 10, weightKg: 60 }],
        createdAt: new Date().toISOString(),
        syncStatus: 'pending',
      });

      await markWorkoutSynced(localId);

      const pending = await getPendingWorkouts();
      expect(pending).toHaveLength(0);

      const all = await offlineDb.workoutQueue.toArray();
      expect(all[0]!.syncStatus).toBe('synced');
      expect(all[0]!.syncedAt).toBeDefined();
    });

    it('should mark workout as failed with error', async () => {
      const localId = uniqueId();
      await queueWorkoutEntry({
        localId,
        sessionInstanceId: 'session-1',
        exerciseId: 'ex-1',
        exerciseName: 'Bench Press',
        orderIndex: 0,
        sets: [{ setNumber: 1, reps: 10, weightKg: 60 }],
        createdAt: new Date().toISOString(),
        syncStatus: 'pending',
      });

      await markWorkoutFailed(localId, 'Network timeout');

      const all = await offlineDb.workoutQueue.toArray();
      expect(all[0]!.syncStatus).toBe('failed');
      expect(all[0]!.syncError).toBe('Network timeout');
    });

    it('should get workouts by session', async () => {
      const id1 = uniqueId();
      const id2 = uniqueId();
      await queueWorkoutEntry({
        localId: id1,
        sessionInstanceId: 'session-A',
        exerciseId: 'ex-1',
        exerciseName: 'Bench Press',
        orderIndex: 0,
        sets: [{ setNumber: 1, reps: 10, weightKg: 60 }],
        createdAt: new Date().toISOString(),
        syncStatus: 'pending',
      });
      await queueWorkoutEntry({
        localId: id2,
        sessionInstanceId: 'session-B',
        exerciseId: 'ex-2',
        exerciseName: 'Squat',
        orderIndex: 0,
        sets: [{ setNumber: 1, reps: 8, weightKg: 80 }],
        createdAt: new Date().toISOString(),
        syncStatus: 'pending',
      });

      const sessionAQueue = await getSessionWorkoutQueue('session-A');
      expect(sessionAQueue).toHaveLength(1);
      expect(sessionAQueue[0]!.localId).toBe(id1);
    });

    it('should clear synced workouts', async () => {
      const id1 = uniqueId();
      const id2 = uniqueId();
      await queueWorkoutEntry({
        localId: id1,
        sessionInstanceId: 'session-1',
        exerciseId: 'ex-1',
        exerciseName: 'Bench Press',
        orderIndex: 0,
        sets: [{ setNumber: 1, reps: 10, weightKg: 60 }],
        createdAt: new Date().toISOString(),
        syncStatus: 'pending',
      });
      await queueWorkoutEntry({
        localId: id2,
        sessionInstanceId: 'session-1',
        exerciseId: 'ex-2',
        exerciseName: 'Squat',
        orderIndex: 1,
        sets: [{ setNumber: 1, reps: 8, weightKg: 80 }],
        createdAt: new Date().toISOString(),
        syncStatus: 'pending',
      });

      await markWorkoutSynced(id1);
      await clearSyncedWorkouts();

      const all = await offlineDb.workoutQueue.toArray();
      expect(all).toHaveLength(1);
      expect(all[0]!.localId).toBe(id2);
    });
  });

  describe('exercise cache', () => {
    const exercises: CachedExercise[] = [
      {
        id: 'ex-1',
        name: 'Bench Press',
        targetMuscleGroup: 'Chest',
        secondaryMuscles: ['Triceps', 'Shoulders'],
        category: 'STRENGTH',
        isActive: true,
        cachedAt: new Date().toISOString(),
      },
      {
        id: 'ex-2',
        name: 'Squat',
        targetMuscleGroup: 'Legs',
        secondaryMuscles: ['Glutes', 'Core'],
        category: 'STRENGTH',
        isActive: true,
        cachedAt: new Date().toISOString(),
      },
    ];

    it('should cache and retrieve exercises', async () => {
      await cacheExercises(exercises);

      const cached = await getCachedExercises();
      expect(cached).toHaveLength(2);
    });

    it('should search exercises by name', async () => {
      await cacheExercises(exercises);

      const results = await searchCachedExercises('bench');
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Bench Press');
    });

    it('should search exercises by muscle group', async () => {
      await cacheExercises(exercises);

      const results = await searchCachedExercises('legs');
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe('Squat');
    });
  });

  describe('session state', () => {
    it('should save and retrieve session state', async () => {
      await saveSessionState({
        sessionInstanceId: 'session-1',
        status: 'IN_PROGRESS',
        startedAt: new Date().toISOString(),
        expectedDurationMin: 60,
        clientName: 'John Doe',
        updatedAt: new Date().toISOString(),
      });

      const active = await getActiveSessionState();
      expect(active).toBeDefined();
      expect(active!.sessionInstanceId).toBe('session-1');
      expect(active!.clientName).toBe('John Doe');
    });

    it('should upsert session state', async () => {
      await saveSessionState({
        sessionInstanceId: 'session-1',
        status: 'IN_PROGRESS',
        startedAt: new Date().toISOString(),
        expectedDurationMin: 60,
        clientName: 'John Doe',
        updatedAt: new Date().toISOString(),
      });
      await saveSessionState({
        sessionInstanceId: 'session-1',
        status: 'COMPLETED',
        startedAt: new Date().toISOString(),
        expectedDurationMin: 60,
        clientName: 'John Doe',
        updatedAt: new Date().toISOString(),
      });

      const all = await offlineDb.sessionState.toArray();
      expect(all).toHaveLength(1);
      expect(all[0]!.status).toBe('COMPLETED');
    });

    it('should clear session state', async () => {
      await saveSessionState({
        sessionInstanceId: 'session-1',
        status: 'IN_PROGRESS',
        startedAt: new Date().toISOString(),
        expectedDurationMin: 60,
        clientName: 'John Doe',
        updatedAt: new Date().toISOString(),
      });
      await clearSessionState('session-1');

      const active = await getActiveSessionState();
      expect(active).toBeUndefined();
    });
  });
});
