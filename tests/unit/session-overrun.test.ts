import { describe, expect, it } from 'vitest';
import {
  AUTO_CLOSE_AFTER_MIN,
  dueOverrunStage,
  elapsedMinutes,
  isStaleForAutoClose,
  openForLabel,
  overrunMinutes,
} from '@/lib/sessionOverrun';

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

describe('elapsedMinutes', () => {
  const now = new Date('2026-07-16T10:00:00.000Z');

  it('returns 0 when the session has not started', () => {
    expect(elapsedMinutes(null, now)).toBe(0);
  });

  it('returns 0 for an unparseable start timestamp', () => {
    expect(elapsedMinutes('not-a-date', now)).toBe(0);
  });

  it('returns 0 for a start timestamp in the future (clock skew)', () => {
    expect(elapsedMinutes('2026-07-16T10:30:00.000Z', now)).toBe(0);
  });

  it('floors whole minutes since the session started', () => {
    expect(elapsedMinutes('2026-07-16T09:00:00.000Z', now)).toBe(60);
    expect(elapsedMinutes('2026-07-16T09:00:30.000Z', now)).toBe(59);
  });
});

describe('dueOverrunStage', () => {
  const now = new Date('2026-07-16T10:00:00.000Z');
  /** A start time `mins` minutes before `now`. */
  const startedAgo = (mins: number) => new Date(now.getTime() - mins * 60_000);

  it('is 0 while the session is inside its booked duration', () => {
    expect(dueOverrunStage(startedAgo(59), 60, now)).toBe(0);
  });

  it('is 1 the moment the booked duration elapses', () => {
    expect(dueOverrunStage(startedAgo(60), 60, now)).toBe(1);
    expect(dueOverrunStage(startedAgo(74), 60, now)).toBe(1);
  });

  it('is 2 from 15 minutes past the booked duration', () => {
    expect(dueOverrunStage(startedAgo(75), 60, now)).toBe(2);
    expect(dueOverrunStage(startedAgo(300), 60, now)).toBe(2);
  });

  it('scales to the booked duration, not a flat hour', () => {
    // A 30-minute slot is nudged at 30 minutes; a 90-minute one is not.
    expect(dueOverrunStage(startedAgo(31), 30, now)).toBe(1);
    expect(dueOverrunStage(startedAgo(31), 90, now)).toBe(0);
  });

  it('stops nudging once the session is old enough to auto-close', () => {
    expect(dueOverrunStage(startedAgo(AUTO_CLOSE_AFTER_MIN - 1), 60, now)).toBe(2);
    expect(dueOverrunStage(startedAgo(AUTO_CLOSE_AFTER_MIN), 60, now)).toBe(0);
  });

  it('is 0 when the session never started', () => {
    expect(dueOverrunStage(null, 60, now)).toBe(0);
  });
});

describe('isStaleForAutoClose', () => {
  const now = new Date('2026-07-16T10:00:00.000Z');
  const startedAgo = (mins: number) => new Date(now.getTime() - mins * 60_000);

  it('is false before 24h', () => {
    expect(isStaleForAutoClose(startedAgo(AUTO_CLOSE_AFTER_MIN - 1), now)).toBe(false);
  });

  it('is true at exactly 24h and beyond', () => {
    expect(isStaleForAutoClose(startedAgo(AUTO_CLOSE_AFTER_MIN), now)).toBe(true);
    expect(isStaleForAutoClose(startedAgo(45 * 24 * 60), now)).toBe(true);
  });

  it('is false when the session never started', () => {
    expect(isStaleForAutoClose(null, now)).toBe(false);
  });
});

describe('openForLabel', () => {
  const now = new Date('2026-07-16T10:00:00.000Z');
  const startedAgo = (mins: number) => new Date(now.getTime() - mins * 60_000);

  it('renders sub-hour ages in minutes, never "0 min"', () => {
    expect(openForLabel(startedAgo(45), now)).toBe('45 min');
    expect(openForLabel(startedAgo(0), now)).toBe('1 min');
  });

  it('renders hours with a minute remainder', () => {
    expect(openForLabel(startedAgo(60), now)).toBe('1 hr');
    expect(openForLabel(startedAgo(140), now)).toBe('2 hr 20 min');
  });

  it('renders multi-day ages in days', () => {
    expect(openForLabel(startedAgo(24 * 60), now)).toBe('1 day');
    expect(openForLabel(startedAgo(45 * 24 * 60), now)).toBe('45 days');
  });
});
