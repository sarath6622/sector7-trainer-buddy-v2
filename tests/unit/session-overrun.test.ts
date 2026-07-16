import { describe, expect, it } from 'vitest';
import { overrunMinutes } from '@/lib/sessionOverrun';

describe('overrunMinutes', () => {
  const now = new Date('2026-07-16T10:00:00.000Z');

  it('returns 0 when the session has not started', () => {
    expect(overrunMinutes(null, 60, now)).toBe(0);
  });

  it('returns 0 while the session is within its planned duration', () => {
    expect(overrunMinutes('2026-07-16T09:30:00.000Z', 60, now)).toBe(0);
  });

  it('returns 0 exactly at the planned end', () => {
    expect(overrunMinutes('2026-07-16T09:00:00.000Z', 60, now)).toBe(0);
  });

  it('returns whole minutes past the planned end', () => {
    expect(overrunMinutes('2026-07-16T08:30:00.000Z', 60, now)).toBe(30);
  });

  it('floors partial minutes', () => {
    expect(overrunMinutes('2026-07-16T08:30:30.000Z', 60, now)).toBe(29);
  });

  it('returns 0 for an unparseable start timestamp', () => {
    expect(overrunMinutes('not-a-date', 60, now)).toBe(0);
  });
});
