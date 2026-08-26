import { describe, expect, it } from 'vitest';
import { buildWeighInNudge, type WeighInSource } from '@/lib/weighIn';

/** Local noon on the given day — avoids UTC-vs-IST calendar-day drift in tests. */
function day(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

const NOW = day('2026-08-26');

function entry(date: string, weightKg: number | null): WeighInSource {
  return { weightKg, recordedAt: day(date) };
}

describe('buildWeighInNudge', () => {
  describe('never logged', () => {
    it('prompts with NEVER_LOGGED when there are no entries at all', () => {
      const n = buildWeighInNudge([], 30, NOW);
      expect(n.shouldPrompt).toBe(true);
      expect(n.reason).toBe('NEVER_LOGGED');
      expect(n.entryCount).toBe(0);
      expect(n.lastWeighIn).toBeNull();
      expect(n.firstWeighIn).toBeNull();
      expect(n.totalChangeKg).toBeNull();
      expect(n.trackedDays).toBeNull();
      expect(n.series).toEqual([]);
    });

    it('prompts with NEVER_LOGGED when entries exist but none carry a weight', () => {
      const n = buildWeighInNudge([entry('2026-08-25', null), entry('2026-08-20', null)], 30, NOW);
      expect(n.reason).toBe('NEVER_LOGGED');
      expect(n.daysSinceLastWeighIn).toBeNull();
    });
  });

  describe('staleness', () => {
    it('does not prompt when the last weigh-in is inside the window', () => {
      const n = buildWeighInNudge([entry('2026-08-10', 74)], 30, NOW);
      expect(n.shouldPrompt).toBe(false);
      expect(n.reason).toBeNull();
      expect(n.daysSinceLastWeighIn).toBe(16);
    });

    it('prompts exactly on the threshold day', () => {
      const n = buildWeighInNudge([entry('2026-07-27', 74)], 30, NOW);
      expect(n.daysSinceLastWeighIn).toBe(30);
      expect(n.shouldPrompt).toBe(true);
      expect(n.reason).toBe('STALE');
    });

    it('does not prompt one day before the threshold', () => {
      const n = buildWeighInNudge([entry('2026-07-28', 74)], 30, NOW);
      expect(n.daysSinceLastWeighIn).toBe(29);
      expect(n.shouldPrompt).toBe(false);
    });

    it('honours a branch-specific threshold', () => {
      const entries = [entry('2026-08-16', 74)]; // 10 days ago
      expect(buildWeighInNudge(entries, 30, NOW).shouldPrompt).toBe(false);
      expect(buildWeighInNudge(entries, 7, NOW).shouldPrompt).toBe(true);
    });

    it('falls back to 30 days when the threshold is zero or negative', () => {
      const n = buildWeighInNudge([entry('2026-08-20', 74)], 0, NOW);
      expect(n.thresholdDays).toBe(30);
      expect(n.shouldPrompt).toBe(false);
    });

    it('ignores body-fat-only entries when measuring recency', () => {
      // Weight is 45 days stale even though something was logged 2 days ago.
      const n = buildWeighInNudge([entry('2026-08-24', null), entry('2026-07-12', 74)], 30, NOW);
      expect(n.daysSinceLastWeighIn).toBe(45);
      expect(n.shouldPrompt).toBe(true);
    });

    it('clamps a future-dated weigh-in to 0 days rather than going negative', () => {
      const n = buildWeighInNudge([entry('2026-09-02', 74)], 30, NOW);
      expect(n.daysSinceLastWeighIn).toBe(0);
      expect(n.shouldPrompt).toBe(false);
    });
  });

  describe('progression', () => {
    const journey = [
      entry('2026-03-14', 79.4),
      entry('2026-04-20', 77.1),
      entry('2026-05-30', 75.8),
      entry('2026-07-01', 75.2),
    ];

    it('reports net change from the first weigh-in to the last', () => {
      const n = buildWeighInNudge(journey, 30, NOW);
      expect(n.totalChangeKg).toBe(-4.2);
      expect(n.firstWeighIn?.weightKg).toBe(79.4);
      expect(n.lastWeighIn?.weightKg).toBe(75.2);
      expect(n.entryCount).toBe(4);
      expect(n.trackedDays).toBe(109);
    });

    it('sorts unordered entries before picking first and last', () => {
      const shuffled = [journey[2], journey[0], journey[3], journey[1]];
      const n = buildWeighInNudge(shuffled, 30, NOW);
      expect(n.firstWeighIn?.weightKg).toBe(79.4);
      expect(n.lastWeighIn?.weightKg).toBe(75.2);
      expect(n.totalChangeKg).toBe(-4.2);
    });

    it('reports a gain as a positive change', () => {
      const n = buildWeighInNudge([entry('2026-03-14', 68), entry('2026-07-01', 72.5)], 30, NOW);
      expect(n.totalChangeKg).toBe(4.5);
    });

    it('rounds change to one decimal', () => {
      const n = buildWeighInNudge(
        [entry('2026-03-14', 79.43), entry('2026-07-01', 75.19)],
        30,
        NOW,
      );
      expect(n.totalChangeKg).toBe(-4.2);
    });

    it('leaves change and trackedDays null with a single weigh-in', () => {
      const n = buildWeighInNudge([entry('2026-03-14', 79.4)], 30, NOW);
      expect(n.totalChangeKg).toBeNull();
      expect(n.trackedDays).toBeNull();
      expect(n.entryCount).toBe(1);
      expect(n.series).toHaveLength(1);
    });
  });

  describe('series', () => {
    it('returns points ascending by date', () => {
      const n = buildWeighInNudge(
        [entry('2026-07-01', 75.2), entry('2026-03-14', 79.4), entry('2026-05-30', 75.8)],
        30,
        NOW,
      );
      expect(n.series.map((p) => p.value)).toEqual([79.4, 75.8, 75.2]);
    });

    it('keeps only the 12 most recent weigh-ins', () => {
      const entries = Array.from({ length: 20 }, (_, i) =>
        entry(`2026-01-${String(i + 1).padStart(2, '0')}`, 80 - i),
      );
      const n = buildWeighInNudge(entries, 30, NOW);
      expect(n.series).toHaveLength(12);
      // Oldest kept point is the 9th entry (80 - 8 = 72); newest is 80 - 19 = 61.
      expect(n.series[0].value).toBe(72);
      expect(n.series[11].value).toBe(61);
      // ...but first/last still describe the whole journey, not the window.
      expect(n.firstWeighIn?.weightKg).toBe(80);
      expect(n.entryCount).toBe(20);
    });
  });

  describe('bad data', () => {
    it('skips entries with an unparseable date', () => {
      const n = buildWeighInNudge(
        [{ weightKg: 74, recordedAt: 'not-a-date' }, entry('2026-07-01', 75.2)],
        30,
        NOW,
      );
      expect(n.entryCount).toBe(1);
      expect(n.lastWeighIn?.weightKg).toBe(75.2);
    });

    it('skips non-finite weights', () => {
      const n = buildWeighInNudge(
        [{ weightKg: Number.NaN, recordedAt: day('2026-08-01') }, entry('2026-07-01', 75.2)],
        30,
        NOW,
      );
      expect(n.entryCount).toBe(1);
    });

    it('accepts ISO strings as well as Date objects', () => {
      const n = buildWeighInNudge([{ weightKg: 74, recordedAt: '2026-08-20T06:30:00.000Z' }], 30, NOW);
      expect(n.entryCount).toBe(1);
      expect(n.shouldPrompt).toBe(false);
    });
  });
});
