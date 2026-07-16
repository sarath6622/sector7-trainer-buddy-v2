import { describe, expect, it } from 'vitest';
import { buildStatsScopeLabel } from '@/lib/sessionStatsLabel';

describe('buildStatsScopeLabel', () => {
  it('names both client and trainer when both filters are active', () => {
    expect(
      buildStatsScopeLabel({
        clientName: 'Ammu Kumar',
        trainerName: 'Dev G',
        datePreset: 'today',
      }),
    ).toBe('Showing stats for client "Ammu Kumar" with trainer "Dev G" · today');
  });

  it('names only the client when no trainer is selected', () => {
    expect(
      buildStatsScopeLabel({ clientName: 'Ammu Kumar', trainerName: null, datePreset: 'today' }),
    ).toBe('Showing stats for client "Ammu Kumar" · today');
  });

  it('names only the trainer when no client is selected', () => {
    expect(
      buildStatsScopeLabel({ clientName: null, trainerName: 'Dev G', datePreset: 'yesterday' }),
    ).toBe('Showing stats for trainer "Dev G" · yesterday');
  });

  it('falls back to all sessions when neither filter is active', () => {
    expect(
      buildStatsScopeLabel({ clientName: null, trainerName: null, datePreset: 'this_week' }),
    ).toBe('Showing stats for all sessions · this week');
  });

  it('describes the this_month preset', () => {
    expect(
      buildStatsScopeLabel({ clientName: null, trainerName: null, datePreset: 'this_month' }),
    ).toBe('Showing stats for all sessions · this month');
  });

  it('formats a custom range as from – to', () => {
    const label = buildStatsScopeLabel({
      clientName: null,
      trainerName: null,
      datePreset: 'custom',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-15',
    });
    expect(label).toBe('Showing stats for all sessions · 1 Jul 2026 – 15 Jul 2026');
  });

  it('collapses a same-day custom range to a single date', () => {
    const label = buildStatsScopeLabel({
      clientName: null,
      trainerName: null,
      datePreset: 'custom',
      dateFrom: '2026-07-15',
      dateTo: '2026-07-15',
    });
    expect(label).toBe('Showing stats for all sessions · 15 Jul 2026');
  });

  it('handles open-ended custom ranges', () => {
    expect(
      buildStatsScopeLabel({
        clientName: null,
        trainerName: null,
        datePreset: 'custom',
        dateFrom: '2026-07-01',
      }),
    ).toBe('Showing stats for all sessions · from 1 Jul 2026');
    expect(
      buildStatsScopeLabel({
        clientName: null,
        trainerName: null,
        datePreset: 'custom',
        dateTo: '2026-07-15',
      }),
    ).toBe('Showing stats for all sessions · until 15 Jul 2026');
    expect(
      buildStatsScopeLabel({ clientName: null, trainerName: null, datePreset: 'custom' }),
    ).toBe('Showing stats for all sessions · all dates');
  });
});
