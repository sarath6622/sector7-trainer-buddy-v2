import { describe, it, expect } from 'vitest';
import { defaultChartRange, filterChartRange, rangeCutoff } from '@/lib/chart-range';

const NOW = new Date('2026-06-12T12:00:00Z');

function pt(date: string) {
  return { date, value: 80 };
}

describe('rangeCutoff', () => {
  it('returns null for all-time', () => {
    expect(rangeCutoff('all', NOW)).toBeNull();
  });

  it('subtracts the right number of months', () => {
    expect(rangeCutoff('1m', NOW)?.toISOString().slice(0, 10)).toBe('2026-05-12');
    expect(rangeCutoff('3m', NOW)?.toISOString().slice(0, 10)).toBe('2026-03-12');
    expect(rangeCutoff('6m', NOW)?.toISOString().slice(0, 10)).toBe('2025-12-12');
    expect(rangeCutoff('1y', NOW)?.toISOString().slice(0, 10)).toBe('2025-06-12');
  });
});

describe('filterChartRange', () => {
  const points = [
    pt('2025-01-15'), // ~17 months back
    pt('2026-01-15'), // ~5 months back
    pt('2026-04-20'), // ~2 months back
    pt('2026-06-01'), // this month
  ];

  it('keeps everything for all-time', () => {
    expect(filterChartRange(points, 'all', NOW)).toHaveLength(4);
  });

  it('filters by cutoff per range', () => {
    expect(filterChartRange(points, '1m', NOW)).toHaveLength(1);
    expect(filterChartRange(points, '3m', NOW)).toHaveLength(2);
    expect(filterChartRange(points, '6m', NOW)).toHaveLength(3);
    expect(filterChartRange(points, '1y', NOW)).toHaveLength(3);
  });
});

describe('defaultChartRange', () => {
  it('picks the smallest range containing every point', () => {
    expect(defaultChartRange([pt('2026-06-01'), pt('2026-05-20')], NOW)).toBe('1m');
    expect(defaultChartRange([pt('2026-04-01'), pt('2026-06-01')], NOW)).toBe('3m');
    expect(defaultChartRange([pt('2026-01-01'), pt('2026-06-01')], NOW)).toBe('6m');
    expect(defaultChartRange([pt('2025-01-01'), pt('2026-06-01')], NOW)).toBe('all');
  });

  it('returns 1m for an empty series', () => {
    expect(defaultChartRange([], NOW)).toBe('1m');
  });
});
