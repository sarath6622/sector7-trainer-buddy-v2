import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { offlineDb, queueWorkoutEntry } from '@/lib/offline-db';
import { syncPendingWorkouts } from '@/lib/offline-sync';

describe('offline-sync', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await offlineDb.workoutQueue.clear();
  });

  it('should return zeros when no pending workouts', async () => {
    const result = await syncPendingWorkouts();

    expect(result).toEqual({ synced: 0, failed: 0, errors: [] });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should sync pending workouts successfully', async () => {
    await queueWorkoutEntry({
      localId: 'local-1',
      sessionInstanceId: 'session-1',
      exerciseId: 'ex-1',
      exerciseName: 'Bench Press',
      orderIndex: 0,
      sets: [{ setNumber: 1, reps: 10, weightKg: 60 }],
      createdAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { synced: 1 } }),
    });

    const result = await syncPendingWorkouts();

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/trainer/workouts/sync',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should handle sync failures gracefully', async () => {
    await queueWorkoutEntry({
      localId: 'local-1',
      sessionInstanceId: 'session-1',
      exerciseId: 'ex-1',
      exerciseName: 'Bench Press',
      orderIndex: 0,
      sets: [{ setNumber: 1, reps: 10, weightKg: 60 }],
      createdAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    });

    const result = await syncPendingWorkouts();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]!.localId).toBe('local-1');
    expect(result.errors[0]!.error).toBe('Server error');
  });

  it('should handle network errors', async () => {
    await queueWorkoutEntry({
      localId: 'local-1',
      sessionInstanceId: 'session-1',
      exerciseId: 'ex-1',
      exerciseName: 'Bench Press',
      orderIndex: 0,
      sets: [{ setNumber: 1, reps: 10, weightKg: 60 }],
      createdAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await syncPendingWorkouts();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0]!.error).toBe('Network error');
  });

  it('should group entries by sessionInstanceId', async () => {
    await queueWorkoutEntry({
      localId: 'local-1',
      sessionInstanceId: 'session-1',
      exerciseId: 'ex-1',
      exerciseName: 'Bench Press',
      orderIndex: 0,
      sets: [{ setNumber: 1, reps: 10, weightKg: 60 }],
      createdAt: new Date().toISOString(),
      syncStatus: 'pending',
    });
    await queueWorkoutEntry({
      localId: 'local-2',
      sessionInstanceId: 'session-1',
      exerciseId: 'ex-2',
      exerciseName: 'Squat',
      orderIndex: 1,
      sets: [{ setNumber: 1, reps: 8, weightKg: 80 }],
      createdAt: new Date().toISOString(),
      syncStatus: 'pending',
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { synced: 2 } }),
    });

    const result = await syncPendingWorkouts();

    // Should make a single fetch call since both belong to same session
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.synced).toBe(2);
  });
});
