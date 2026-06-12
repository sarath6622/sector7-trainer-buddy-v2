import { describe, it, expect } from 'vitest';
import {
  buildSavePayload,
  diffExercises,
  hasDraftRows,
  isSetComplete,
  normalizeSet,
  setSignature,
  signaturesOf,
  type ExerciseEntry,
  type SetData,
} from '@/components/workout/WorkoutLogger';

// Covers the "only save once the work fields are entered" rule and the per-set
// "saved" signatures that drive the green state in the workout logger.
//   - buildSavePayload drops partial sets (e.g. WEIGHTED kg without reps) but
//     keeps every exercise — an exercise with no complete set yet persists as a
//     zero-set row so it survives a tab switch / navigation. orderIndex is the
//     entry's position in the list.
//   - a row's signature changes the moment any value is edited, so the green
//     state only sticks while the on-screen values match what was saved.

function makeSet(over: Partial<SetData> = {}): SetData {
  return {
    setNumber: 1,
    reps: undefined,
    weightKg: undefined,
    durationSec: undefined,
    rpe: undefined,
    restSec: undefined,
    stepsCount: undefined,
    notes: '',
    ...over,
  };
}

function makeEntry(over: Partial<ExerciseEntry> = {}): ExerciseEntry {
  return {
    tempId: 'temp-1',
    exerciseId: 'ex-1',
    exerciseName: 'Bench Press',
    targetMuscle: 'Chest',
    category: 'Compound',
    exerciseType: 'WEIGHTED',
    secondaryMetric: 'NONE',
    sets: [makeSet()],
    collapsed: false,
    isCompleted: false,
    ...over,
  };
}

describe('isSetComplete', () => {
  it('WEIGHTED needs both reps and weight', () => {
    expect(isSetComplete(makeSet({ weightKg: 10, reps: 10 }), 'WEIGHTED')).toBe(true);
    expect(isSetComplete(makeSet({ weightKg: 10 }), 'WEIGHTED')).toBe(false);
    expect(isSetComplete(makeSet({ reps: 10 }), 'WEIGHTED')).toBe(false);
  });

  it('BODYWEIGHT needs reps only', () => {
    expect(isSetComplete(makeSet({ reps: 12 }), 'BODYWEIGHT')).toBe(true);
    expect(isSetComplete(makeSet(), 'BODYWEIGHT')).toBe(false);
  });

  it('DURATION and CARDIO need duration only', () => {
    expect(isSetComplete(makeSet({ durationSec: 60 }), 'DURATION')).toBe(true);
    expect(isSetComplete(makeSet({ durationSec: 60 }), 'CARDIO')).toBe(true);
    expect(isSetComplete(makeSet(), 'CARDIO')).toBe(false);
  });
});

describe('buildSavePayload', () => {
  it('keeps only complete sets within an exercise', () => {
    const entry = makeEntry({
      sets: [
        makeSet({ setNumber: 1, weightKg: 10, reps: 10 }),
        makeSet({ setNumber: 2, weightKg: 10 }), // partial — kg only
      ],
    });
    const payload = buildSavePayload([entry]);
    expect(payload).toHaveLength(1);
    expect(payload[0]!.sets).toHaveLength(1);
    expect(payload[0]!.sets[0]!.setNumber).toBe(1);
  });

  it('keeps an exercise with no complete set as a zero-set row', () => {
    const entry = makeEntry({ sets: [makeSet({ weightKg: 10 })] }); // kg, no reps
    const payload = buildSavePayload([entry]);
    expect(payload).toHaveLength(1);
    expect(payload[0]!.exerciseId).toBe('ex-1');
    expect(payload[0]!.orderIndex).toBe(0);
    expect(payload[0]!.sets).toEqual([]); // structure persists, the partial set does not
  });

  it('keeps every exercise and uses list position as orderIndex', () => {
    const empty = makeEntry({ exerciseId: 'ex-empty', sets: [makeSet()] });
    const logged = makeEntry({
      exerciseId: 'ex-logged',
      sets: [makeSet({ weightKg: 20, reps: 8 })],
    });
    const payload = buildSavePayload([empty, logged]);
    expect(payload).toHaveLength(2);
    expect(payload[0]!.exerciseId).toBe('ex-empty');
    expect(payload[0]!.orderIndex).toBe(0);
    expect(payload[0]!.sets).toEqual([]);
    expect(payload[1]!.exerciseId).toBe('ex-logged');
    expect(payload[1]!.orderIndex).toBe(1);
    expect(payload[1]!.sets).toHaveLength(1);
  });
});

describe('set signatures', () => {
  it('matches a saved set and breaks when any value is edited', () => {
    const entry = makeEntry({ sets: [makeSet({ weightKg: 10, reps: 10 })] });
    const saved = signaturesOf(buildSavePayload([entry]));

    // Same values → still saved (green).
    expect(saved.has(setSignature(entry.exerciseId, normalizeSet(entry.sets[0]!)))).toBe(true);

    // Edited reps → signature no longer matches (green drops).
    const edited = { ...entry.sets[0]!, reps: 12 };
    expect(saved.has(setSignature(entry.exerciseId, normalizeSet(edited)))).toBe(false);
  });
});

// diffExercises scopes each write to what THIS device changed since its last
// sync, so a stale snapshot from a peer (ADR-036 trainer↔client write path)
// can't full-replace over the other side's concurrent edits.
describe('diffExercises', () => {
  const A = buildSavePayload([
    makeEntry({ exerciseId: 'ex-a', sets: [makeSet({ weightKg: 10, reps: 10 })] }),
  ]);
  const Aedited = buildSavePayload([
    makeEntry({ exerciseId: 'ex-a', sets: [makeSet({ weightKg: 20, reps: 10 })] }),
  ]);
  const B = buildSavePayload([
    makeEntry({ exerciseId: 'ex-b', sets: [makeSet({ weightKg: 5, reps: 5 })] }),
  ]);

  it('flags only the exercises whose values changed', () => {
    const { dirtyExerciseIds, removedExerciseIds } = diffExercises(A, Aedited);
    expect(dirtyExerciseIds).toEqual(['ex-a']);
    expect(removedExerciseIds).toEqual([]);
  });

  it('treats a brand-new exercise as dirty and leaves the untouched one alone', () => {
    const { dirtyExerciseIds, removedExerciseIds } = diffExercises(A, [...A, ...B]);
    expect(dirtyExerciseIds).toEqual(['ex-b']); // ex-a unchanged → not re-sent
    expect(removedExerciseIds).toEqual([]);
  });

  it('reports an exercise present last time but now gone as removed', () => {
    const { dirtyExerciseIds, removedExerciseIds } = diffExercises([...A, ...B], A);
    expect(dirtyExerciseIds).toEqual([]);
    expect(removedExerciseIds).toEqual(['ex-b']);
  });

  it('first save (no prior snapshot) marks everything dirty, nothing removed', () => {
    const { dirtyExerciseIds, removedExerciseIds } = diffExercises([], [...A, ...B]);
    expect(dirtyExerciseIds).toEqual(['ex-a', 'ex-b']);
    expect(removedExerciseIds).toEqual([]);
  });

  // Per-set scoping: the writer names every set it deleted within a dirty
  // exercise so the server drops exactly those — set rows the writer never
  // saw (a peer's concurrent additions to the same exercise) survive.
  it('reports set numbers removed within a dirty exercise', () => {
    const twoSets = buildSavePayload([
      makeEntry({
        exerciseId: 'ex-a',
        sets: [
          makeSet({ setNumber: 1, weightKg: 10, reps: 10 }),
          makeSet({ setNumber: 2, weightKg: 20, reps: 8 }),
        ],
      }),
    ]);
    const oneSet = buildSavePayload([
      makeEntry({ exerciseId: 'ex-a', sets: [makeSet({ setNumber: 1, weightKg: 10, reps: 10 })] }),
    ]);
    const { dirtyExerciseIds, removedSetsByExerciseId } = diffExercises(twoSets, oneSet);
    expect(dirtyExerciseIds).toEqual(['ex-a']);
    expect(removedSetsByExerciseId).toEqual({ 'ex-a': [2] });
  });

  it('value edits and brand-new exercises report no removed sets', () => {
    expect(diffExercises(A, Aedited).removedSetsByExerciseId).toEqual({});
    expect(diffExercises(A, [...A, ...B]).removedSetsByExerciseId).toEqual({});
  });
});

// hasDraftRows flags local work the save payload can't carry — a half-typed
// set or an extra blank "Add Set" row. Both used to read as "nothing unsaved",
// letting the 10s poll / Pusher refetch rehydrate from the server and wipe the
// row while the trainer was still typing.
describe('hasDraftRows', () => {
  it('a half-typed set (kg without reps) is a draft', () => {
    const entry = makeEntry({ sets: [makeSet({ weightKg: 52.5 })] });
    expect(hasDraftRows([entry], buildSavePayload([entry]))).toBe(true);
  });

  it('fully typed sets matching the saved snapshot are not drafts', () => {
    const entry = makeEntry({ sets: [makeSet({ weightKg: 10, reps: 10 })] });
    expect(hasDraftRows([entry], buildSavePayload([entry]))).toBe(false);
  });

  it('the single blank placeholder row on a zero-set exercise is not a draft', () => {
    const entry = makeEntry({ sets: [makeSet()] });
    // Saved payload holds the exercise as a zero-set row.
    expect(hasDraftRows([entry], buildSavePayload([entry]))).toBe(false);
  });

  it('an extra blank row beyond the saved sets (fresh "Add Set") is a draft', () => {
    const saved = makeEntry({ sets: [makeSet({ setNumber: 1, weightKg: 10, reps: 10 })] });
    const withBlank = makeEntry({
      sets: [makeSet({ setNumber: 1, weightKg: 10, reps: 10 }), makeSet({ setNumber: 2 })],
    });
    expect(hasDraftRows([withBlank], buildSavePayload([saved]))).toBe(true);
  });

  it('rest-only autofill on an incomplete row is a draft', () => {
    const entry = makeEntry({ sets: [makeSet({ restSec: 90 })] });
    expect(hasDraftRows([entry], buildSavePayload([entry]))).toBe(true);
  });
});
