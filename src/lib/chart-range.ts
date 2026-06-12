/**
 * Time-range filtering for progress chart series.
 * The charts API returns the full history; ranges are applied client-side.
 */

export type ChartRange = '1m' | '3m' | '6m' | '1y' | 'all';

export const CHART_RANGES: { value: ChartRange; label: string }[] = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: 'all', label: 'All' },
];

const RANGE_MONTHS: Record<Exclude<ChartRange, 'all'>, number> = {
  '1m': 1,
  '3m': 3,
  '6m': 6,
  '1y': 12,
};

export function rangeCutoff(range: ChartRange, now: Date = new Date()): Date | null {
  if (range === 'all') return null;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - RANGE_MONTHS[range]);
  return cutoff;
}

export function filterChartRange<T extends { date: string }>(
  points: T[],
  range: ChartRange,
  now: Date = new Date(),
): T[] {
  const cutoff = rangeCutoff(range, now);
  if (!cutoff) return points;
  return points.filter((p) => new Date(p.date) >= cutoff);
}

/**
 * Smallest range that still contains every point — used as the default so a
 * user whose last entry is months old doesn't open onto an empty chart.
 */
export function defaultChartRange<T extends { date: string }>(
  points: T[],
  now: Date = new Date(),
): ChartRange {
  for (const { value } of CHART_RANGES) {
    if (value === 'all') break;
    if (filterChartRange(points, value, now).length === points.length) return value;
  }
  return 'all';
}
