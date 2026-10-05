import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import { InlineRemaining } from '@/components/timer/SessionTimer';

const NOW = new Date(2026, 9, 5, 12, 0, 0);

/** A session that started `minsAgo` minutes before the frozen clock. */
function startedMinsAgo(minsAgo: number) {
  return new Date(NOW.getTime() - minsAgo * 60_000).toISOString();
}

function renderRemaining(minsAgo: number, durationMin = 60) {
  return render(
    <InlineRemaining startedAt={startedMinsAgo(minsAgo)} expectedDurationMin={durationMin} />,
  );
}

describe('InlineRemaining', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts down the time left in a session', () => {
    const { container } = renderRemaining(55);
    expect(container.textContent).toBe('05:00 left');
  });

  it('pads to mm:ss', () => {
    const { container } = renderRemaining(59.5);
    expect(container.textContent).toBe('00:30 left');
  });

  it('shows h:mm:ss while more than an hour remains', () => {
    const { container } = renderRemaining(0, 90);
    expect(container.textContent).toBe('1:30:00 left');
  });

  it('flips to "over" once the session runs past its duration', () => {
    const { container } = renderRemaining(65);
    expect(container.textContent).toBe('05:00 over');
  });

  it('marks overtime as destructive and normal time as brand', () => {
    const { container: running } = renderRemaining(10);
    expect(running.firstElementChild?.className).toContain('text-primary');

    const { container: over } = renderRemaining(70);
    expect(over.firstElementChild?.className).toContain('text-destructive');
  });

  it('ticks down once a second', () => {
    const { container } = renderRemaining(55);
    expect(container.textContent).toBe('05:00 left');

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(container.textContent).toBe('04:57 left');
  });

  it('crosses zero into overtime as it ticks', () => {
    const { container } = renderRemaining(59.95); // 3 seconds left
    expect(container.textContent).toBe('00:03 left');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(container.textContent).toBe('00:02 over');
  });
});
