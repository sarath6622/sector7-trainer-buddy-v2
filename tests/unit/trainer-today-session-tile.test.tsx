import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TodaySessionTile, type TodaySessionTileData } from '@/components/trainer/TodaySessionTile';

const BASE: TodaySessionTileData = {
  id: 'si-1',
  scheduledTime: '09:00',
  durationMin: 60,
  status: 'SCHEDULED',
  clientFirstName: 'Rahul',
  clientLastName: 'K',
};

function setup(
  session: Partial<TodaySessionTileData> = {},
  props: Partial<React.ComponentProps<typeof TodaySessionTile>> = {},
) {
  const onStart = vi.fn();
  const onNoShow = vi.fn();
  const onOpen = vi.fn();
  const { container } = render(
    <TodaySessionTile
      session={{ ...BASE, ...session }}
      isLoading={false}
      onStart={onStart}
      onNoShow={onNoShow}
      onOpen={onOpen}
      {...props}
    />,
  );
  return { onStart, onNoShow, onOpen, container };
}

describe('TodaySessionTile', () => {
  it('splits the time into a 12h clock and a meridiem', () => {
    setup({ scheduledTime: '09:00' });
    expect(screen.getByText('09:00')).toBeTruthy();
    expect(screen.getByText('AM')).toBeTruthy();
  });

  it('renders afternoon times as PM', () => {
    setup({ scheduledTime: '17:30' });
    expect(screen.getByText('05:30')).toBeTruthy();
    expect(screen.getByText('PM')).toBeTruthy();
  });

  it('renders noon as 12:00 PM, not 00:00', () => {
    setup({ scheduledTime: '12:00' });
    expect(screen.getByText('12:00')).toBeTruthy();
    expect(screen.getByText('PM')).toBeTruthy();
  });

  it('renders midnight as 12:00 AM', () => {
    setup({ scheduledTime: '00:15' });
    expect(screen.getByText('12:15')).toBeTruthy();
    expect(screen.getByText('AM')).toBeTruthy();
  });

  it('shows the client and duration', () => {
    setup();
    expect(screen.getByText('Rahul K')).toBeTruthy();
    expect(screen.getByText(/60 min/)).toBeTruthy();
  });

  it('puts the live meta note on the duration line', () => {
    const { container } = setup({}, { meta: <span>04:57 left</span> });
    expect(container.textContent).toContain('60 min · 04:57 left');
  });

  it('starts and marks no-show on a scheduled session', () => {
    const { onStart, onNoShow } = setup();
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));
    expect(onStart).toHaveBeenCalledWith('si-1');
    fireEvent.click(screen.getByRole('button', { name: /no show/i }));
    expect(onNoShow).toHaveBeenCalledWith('si-1');
  });

  it('disables both actions while a start is in flight', () => {
    setup({}, { isLoading: true });
    expect(screen.getByRole('button', { name: /starting/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: /no show/i }).hasAttribute('disabled')).toBe(true);
  });

  it('offers resume instead of start while live, with no status word', () => {
    const { onOpen, container } = setup({ status: 'IN_PROGRESS' });
    expect(screen.queryByRole('button', { name: /^start$/i })).toBeNull();
    // The green Resume plus the countdown say "running"; no pill or label.
    expect(container.textContent).not.toContain('In Progress');
    fireEvent.click(screen.getByRole('button', { name: /resume/i }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'si-1' }));
  });

  it('names the terminal states in words, since they have no live clock', () => {
    const { container: done } = setup({ status: 'COMPLETED' });
    expect(done.textContent).toContain('60 min · Completed');

    const { container: noShow } = setup({ status: 'NO_SHOW' });
    expect(noShow.textContent).toContain('60 min · No show');

    const { container: cancelled } = setup({ status: 'CANCELLED' });
    expect(cancelled.textContent).toContain('60 min · Cancelled');
  });

  it('offers a view-workout action once completed', () => {
    const { onOpen } = setup({ status: 'COMPLETED' });
    fireEvent.click(screen.getByRole('button', { name: /view workout for Rahul K/i }));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'si-1' }));
  });

  it('offers no action on a no-show session', () => {
    setup({ status: 'NO_SHOW' });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('strikes through a cancelled client name', () => {
    setup({ status: 'CANCELLED' });
    expect(screen.getByText('Rahul K').className).toContain('line-through');
  });

  it('sizes every row action identically so the column lines up', () => {
    const width = (c: HTMLElement, name: RegExp) =>
      [...c.querySelectorAll('button')].find((b) =>
        name.test(b.getAttribute('aria-label') ?? b.textContent ?? ''),
      )?.className;

    const { container: scheduled } = setup();
    const { container: live } = setup({ status: 'IN_PROGRESS' });
    const { container: done } = setup({ status: 'COMPLETED' });

    expect(width(scheduled, /^Start$/)).toContain('w-20');
    expect(width(live, /Resume/)).toContain('w-20');
    expect(width(done, /View workout/)).toContain('w-20');
  });
});
