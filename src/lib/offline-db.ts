import Dexie, { type EntityTable } from 'dexie';

/** Offline workout log entry queued for sync */
export interface OfflineWorkoutEntry {
  id?: number; // auto-increment
  localId: string; // UUID generated client-side
  sessionInstanceId: string;
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  sets: OfflineSet[];
  createdAt: string; // ISO string
  syncStatus: 'pending' | 'synced' | 'failed';
  syncError?: string;
  syncedAt?: string;
}

export interface OfflineSet {
  setNumber: number;
  reps?: number;
  weightKg?: number;
  durationSec?: number;
  rpe?: number;
  notes?: string;
}

/** Cached exercise from the exercise library */
export interface CachedExercise {
  id: string;
  name: string;
  targetMuscleGroup: string;
  secondaryMuscles: string[];
  equipmentRequired?: string;
  category: string;
  instructions?: string;
  isActive: boolean;
  cachedAt: string;
}

/** Active session state for offline continuity */
export interface OfflineSessionState {
  id?: number;
  sessionInstanceId: string;
  status: string;
  startedAt: string;
  expectedDurationMin: number;
  clientName: string;
  updatedAt: string;
}

class OfflineDatabase extends Dexie {
  workoutQueue!: EntityTable<OfflineWorkoutEntry, 'id'>;
  exercises!: EntityTable<CachedExercise, 'id'>;
  sessionState!: EntityTable<OfflineSessionState, 'id'>;

  constructor() {
    super('sector7-offline');

    this.version(1).stores({
      workoutQueue: '++id, localId, sessionInstanceId, syncStatus',
      exercises: 'id, name, targetMuscleGroup, category',
      sessionState: '++id, sessionInstanceId',
    });
  }
}

export const offlineDb = new OfflineDatabase();

// ─── WORKOUT QUEUE OPERATIONS ────────────────────────

export async function queueWorkoutEntry(entry: Omit<OfflineWorkoutEntry, 'id'>) {
  return offlineDb.workoutQueue.add(entry);
}

export async function getPendingWorkouts() {
  return offlineDb.workoutQueue.where('syncStatus').equals('pending').toArray();
}

export async function markWorkoutSynced(localId: string) {
  await offlineDb.workoutQueue
    .where('localId')
    .equals(localId)
    .modify({ syncStatus: 'synced' as const, syncedAt: new Date().toISOString() });
}

export async function markWorkoutFailed(localId: string, error: string) {
  await offlineDb.workoutQueue
    .where('localId')
    .equals(localId)
    .modify({ syncStatus: 'failed' as const, syncError: error });
}

export async function getSessionWorkoutQueue(sessionInstanceId: string) {
  return offlineDb.workoutQueue.where('sessionInstanceId').equals(sessionInstanceId).toArray();
}

export async function clearSyncedWorkouts() {
  return offlineDb.workoutQueue.where('syncStatus').equals('synced').delete();
}

// ─── EXERCISE CACHE OPERATIONS ───────────────────────

export async function cacheExercises(exercises: CachedExercise[]) {
  await offlineDb.exercises.bulkPut(exercises);
}

export async function getCachedExercises() {
  return offlineDb.exercises.filter((e) => e.isActive).toArray();
}

export async function searchCachedExercises(query: string) {
  const lower = query.toLowerCase();
  return offlineDb.exercises
    .filter(
      (e) =>
        e.isActive &&
        (e.name.toLowerCase().includes(lower) ||
          e.targetMuscleGroup.toLowerCase().includes(lower) ||
          e.category.toLowerCase().includes(lower)),
    )
    .toArray();
}

// ─── SESSION STATE OPERATIONS ────────────────────────

export async function saveSessionState(state: Omit<OfflineSessionState, 'id'>) {
  // Upsert by sessionInstanceId
  const existing = await offlineDb.sessionState
    .where('sessionInstanceId')
    .equals(state.sessionInstanceId)
    .first();

  if (existing) {
    await offlineDb.sessionState.update(existing.id!, state);
  } else {
    await offlineDb.sessionState.add(state);
  }
}

export async function getActiveSessionState() {
  return offlineDb.sessionState.toCollection().first();
}

export async function clearSessionState(sessionInstanceId: string) {
  await offlineDb.sessionState.where('sessionInstanceId').equals(sessionInstanceId).delete();
}
