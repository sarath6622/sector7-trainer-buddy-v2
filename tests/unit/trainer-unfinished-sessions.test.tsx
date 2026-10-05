import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  UnfinishedSessionsCard,
  openForLabel,
  type UnfinishedSession,
} from '@/components/trainer/UnfinishedSessionsCard';

const NOW = new Date(2026, 9, 5, 12, 0, 0).getTime();

function session(over: Partial<UnfinishedSession> = {}): UnfinishedSession {
  return {
    id: 'si-1',
    scheduledDate: new Date(2026, 9, 3, 0, 0, 0).toISOString(),
    startedAt: new Date(2026, 9, 3, 12, 0, 0).toISOString(),
    clientFirstName: 'Test',
    clientLastName: 'Hazeena B',
    ...over,
  };
}

describe('openForLabel', () => {
  it('counts minutes under an hour, never zero', () => {
    const startedAt = new Date(NOW - 40 * 60_000).toISOString();
    expect(openForLabel(session({ startedAt }), NOW)).toBe('Open for 40 minutes');

    const justNow = new Date(NOW - 5_000).toISOString();
    expect(openForLabel(session({ startedAt: justNow }), NOW)).toBe('Open for 1 minute');
  });

  it('counts hours up to a day', () => {
    const startedAt = new Date(NOW - 5 * 60 * 60_000).toISOString();
    expect(openForLabel(session({ startedAt }), NOW)).toBe('Open for 5 hours');
  });

  it('counts days beyond that, singular at exactly one', () => {
    const oneDay = new Date(NOW - 24 * 60 * 60_000).toISOString();
    expect(openForLabel(session({ startedAt: oneDay }), NOW)).toBe('Open for 1 day');

    const twoDays = new Date(NOW - 50 * 60 * 60_000).toISOString();
    expect(openForLabel(session({ startedAt: twoDays }), NOW)).toBe('Open for 2 days');
  });

  it('falls back to the scheduled date when it was never started', () => {
    const s = session({
      startedAt: undefined,
      scheduledDate: new Date(NOW - 3 * 86_400_000).toISOString(),
    });
    expect(openForLabel(s, NOW)).toBe('Open for 3 days');
  });
});

describe('UnfinishedSessionsCard', () => {
  it('renders nothing when there is nothing to clean up', () => {
    const { container } = render(<UnfinishedSessionsCard sessions={[]} onOpen={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('names a single unfinished session in the singular', () => {
    render(<UnfinishedSessionsCard sessions={[session()]} onOpen={vi.fn()} />);
    expect(screen.getByText('Unfinished session')).toBeTruthy();
    expect(screen.getByText('Test Hazeena B')).toBeTruthy();
  });

  it('counts several in the plural', () => {
    render(
      <UnfinishedSessionsCard
        sessions={[session(), session({ id: 'si-2', clientFirstName: 'Rahul' })]}
        onOpen={vi.fn()}
      />,
    );
    expect(screen.getByText('2 unfinished sessions')).toBeTruthy();
  });

  it('opens the session to resume and end it', () => {
    const onOpen = vi.fn();
    render(<UnfinishedSessionsCard sessions={[session()]} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /resume & end/i }));
    expect(onOpen).toHaveBeenCalledWith('si-1');
  });
});
