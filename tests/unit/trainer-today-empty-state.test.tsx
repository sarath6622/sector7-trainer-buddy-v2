import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TodayEmptyState } from '@/components/trainer/TodayEmptyState';

function setup(props: Partial<React.ComponentProps<typeof TodayEmptyState>> = {}) {
  const onNavigate = vi.fn();
  render(<TodayEmptyState clientCount={4} onNavigate={onNavigate} {...props} />);
  return { onNavigate };
}

describe('TodayEmptyState', () => {
  it('says the schedule is clear', () => {
    setup();
    expect(screen.getByText('No sessions scheduled')).toBeTruthy();
    expect(screen.getByText('Your schedule is clear today.')).toBeTruthy();
  });

  it('deep-links the schedule button to the booking modal for today', () => {
    const { onNavigate } = setup();
    fireEvent.click(screen.getByRole('button', { name: /schedule session/i }));
    expect(onNavigate).toHaveBeenCalledWith('/trainer/schedule?book=today');
  });

  it('offers no booking action when the trainer has no clients', () => {
    setup({ clientCount: 0 });
    expect(screen.getByText(/no clients assigned to you yet/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /schedule session/i })).toBeNull();
  });
});
