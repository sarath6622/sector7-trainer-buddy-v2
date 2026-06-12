import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionTimer } from '@/components/timer/SessionTimer';

const NOW = new Date('2026-06-12T10:00:00Z');

function renderTimer({
  elapsedMin,
  expectedDurationMin = 60,
  variant,
}: {
  elapsedMin: number;
  expectedDurationMin?: number;
  variant?: 'default' | 'onAccent';
}) {
  const startedAt = new Date(NOW.getTime() - elapsedMin * 60_000).toISOString();
  return render(
    <SessionTimer
      startedAt={startedAt}
      expectedDurationMin={expectedDurationMin}
      variant={variant}
    />,
  );
}

describe('SessionTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('time display sizing', () => {
    it('uses the full lg font size while under an hour', () => {
      renderTimer({ elapsedMin: 45 });
      expect(screen.getByText('45:00')).toHaveClass('text-5xl');
    });

    it('steps the font down once the time grows to h:mm:ss so it fits the ring', () => {
      renderTimer({ elapsedMin: 121, expectedDurationMin: 180 });
      const time = screen.getByText('2:01:00');
      expect(time).toHaveClass('text-4xl');
      expect(time).not.toHaveClass('text-5xl');
    });
  });

  describe('default variant colors', () => {
    it('shows foreground time and no overtime message while within duration', () => {
      renderTimer({ elapsedMin: 30 });
      expect(screen.getByText('30:00')).toHaveClass('text-foreground');
      expect(screen.queryByText(/overtime by/)).not.toBeInTheDocument();
    });

    it('switches to destructive styling when overtime', () => {
      renderTimer({ elapsedMin: 70 });
      expect(screen.getByText('1:10:00')).toHaveClass('text-destructive');
      expect(screen.getByText(/overtime by 0?0:10:00|overtime by 10:00/)).toHaveClass(
        'text-destructive',
      );
    });
  });

  describe('onAccent variant colors', () => {
    it('keeps the time white instead of theme foreground', () => {
      renderTimer({ elapsedMin: 30, variant: 'onAccent' });
      const time = screen.getByText('30:00');
      expect(time).toHaveClass('text-white');
      expect(time).not.toHaveClass('text-foreground');
    });

    it('uses amber, not destructive red, for overtime on colored backgrounds', () => {
      renderTimer({ elapsedMin: 121, variant: 'onAccent' });
      const time = screen.getByText('2:01:00');
      expect(time).toHaveClass('text-white');
      expect(time).not.toHaveClass('text-destructive');
      const message = screen.getByText(/overtime by/);
      expect(message).toHaveClass('text-amber-200');
      expect(message).not.toHaveClass('text-destructive');
    });
  });

  it('shows the overtime message with the elapsed overtime amount', () => {
    renderTimer({ elapsedMin: 75 });
    expect(screen.getByText(/PT time completed — overtime by 15:00/)).toBeInTheDocument();
  });
});
