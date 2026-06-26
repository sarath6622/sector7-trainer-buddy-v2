import { describe, it, expect, beforeEach, vi } from 'vitest';
import { writeOutbox, readOutbox, clearOutbox, type OutboxRecord } from '@/lib/workout-outbox';

// These cover the durability contract the WorkoutLogger relies on: an unsaved
// payload survives a write/read round-trip (the cold-start recovery path) and
// is dropped once confirmed. jsdom's localStorage is unreliable across setups,
// so we install a clean in-memory Storage for each test.

type Payload = { exerciseId: string; orderIndex: number; isCompleted: boolean; sets: unknown[] };

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const SESSION = 'session-abc';
const sample: Payload[] = [
  { exerciseId: 'ex-1', orderIndex: 0, isCompleted: false, sets: [{ setNumber: 1, reps: 10 }] },
];

describe('workout-outbox', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('round-trips a written payload', () => {
    writeOutbox(SESSION, sample);
    const record = readOutbox<Payload>(SESSION);
    expect(record).not.toBeNull();
    expect(record?.exercises).toEqual(sample);
    expect(typeof record?.ts).toBe('number');
  });

  it('returns null when nothing is stored', () => {
    expect(readOutbox<Payload>(SESSION)).toBeNull();
  });

  it('clears a stored payload', () => {
    writeOutbox(SESSION, sample);
    clearOutbox(SESSION);
    expect(readOutbox<Payload>(SESSION)).toBeNull();
  });

  it('scopes entries per session id', () => {
    writeOutbox('session-1', sample);
    writeOutbox('session-2', [{ ...sample[0], exerciseId: 'ex-2' }]);
    expect(readOutbox<Payload>('session-1')?.exercises[0].exerciseId).toBe('ex-1');
    expect(readOutbox<Payload>('session-2')?.exercises[0].exerciseId).toBe('ex-2');
    clearOutbox('session-1');
    expect(readOutbox<Payload>('session-1')).toBeNull();
    // Clearing one session must not touch another.
    expect(readOutbox<Payload>('session-2')).not.toBeNull();
  });

  it('overwrites the previous payload for the same session', () => {
    writeOutbox(SESSION, sample);
    const next: Payload[] = [{ ...sample[0], sets: [{ setNumber: 1, reps: 12 }] }];
    writeOutbox(SESSION, next);
    expect(readOutbox<Payload>(SESSION)?.exercises).toEqual(next);
  });

  it('returns null for malformed stored JSON instead of throwing', () => {
    window.localStorage.setItem('sector7:workout-outbox:' + SESSION, '{not valid json');
    expect(() => readOutbox<Payload>(SESSION)).not.toThrow();
    expect(readOutbox<Payload>(SESSION)).toBeNull();
  });

  it('returns null when stored shape is missing the exercises array', () => {
    window.localStorage.setItem(
      'sector7:workout-outbox:' + SESSION,
      JSON.stringify({ ts: Date.now() } as Partial<OutboxRecord<Payload>>),
    );
    expect(readOutbox<Payload>(SESSION)).toBeNull();
  });

  it('ignores an empty session id without throwing', () => {
    expect(() => writeOutbox('', sample)).not.toThrow();
    expect(readOutbox<Payload>('')).toBeNull();
  });
});
