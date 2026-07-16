/**
 * Builds the human-readable scope line shown above the admin Sessions stat
 * cards, e.g. `Showing stats for client "Ammu Kumar" with trainer "Dev G" · this week`.
 * Pure function so the labelling rules are unit-testable.
 */

export type SessionDatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

export interface StatsScopeInput {
  clientName: string | null;
  trainerName: string | null;
  datePreset: SessionDatePreset;
  /** Only read when datePreset === 'custom'. ISO dates (YYYY-MM-DD). */
  dateFrom?: string;
  dateTo?: string;
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "07:25" → "7:25 PM" */
export function formatTime12(t: string): string {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

/** ISO date/datetime → "Mon, 18 May 2026" */
export function formatDayHeading(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** ISO datetime → "7:02 PM" (local clock time) */
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function describeScope(clientName: string | null, trainerName: string | null): string {
  if (clientName && trainerName) return `client "${clientName}" with trainer "${trainerName}"`;
  if (clientName) return `client "${clientName}"`;
  if (trainerName) return `trainer "${trainerName}"`;
  return 'all sessions';
}

export function describeDates(preset: SessionDatePreset, dateFrom?: string, dateTo?: string): string {
  if (preset === 'today') return 'today';
  if (preset === 'yesterday') return 'yesterday';
  if (preset === 'this_week') return 'this week';
  if (preset === 'this_month') return 'this month';
  if (dateFrom && dateTo) {
    if (dateFrom === dateTo) return formatDay(dateFrom);
    return `${formatDay(dateFrom)} – ${formatDay(dateTo)}`;
  }
  if (dateFrom) return `from ${formatDay(dateFrom)}`;
  if (dateTo) return `until ${formatDay(dateTo)}`;
  return 'all dates';
}

export function buildStatsScopeLabel(input: StatsScopeInput): string {
  const scope = describeScope(input.clientName, input.trainerName);
  const dates = describeDates(input.datePreset, input.dateFrom, input.dateTo);
  return `Showing stats for ${scope} · ${dates}`;
}
