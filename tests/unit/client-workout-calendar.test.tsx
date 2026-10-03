import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ClientWorkoutCalendar } from '@/components/calendar/ClientWorkoutCalendar';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const CLIENTS = [
  { id: 'cp-1', firstName: 'Test Hazeena', lastName: 'B' },
  { id: 'cp-2', firstName: 'Test Sarath', lastName: 'Kumar' },
  { id: 'cp-3', firstName: 'Aiswarya', lastName: 'Nair' },
];

/** Records every calendar URL the embedded WorkoutCalendarCard fetches. */
let calls: string[] = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    })
  );
});

describe('ClientWorkoutCalendar client picker', () => {
  it('renders a dropdown, not a pill per client', () => {
    render(<ClientWorkoutCalendar clients={CLIENTS} />);
    // One trigger button, showing the first client — the other clients are not
    // rendered until the dropdown is opened (this is the point of the fix:
    // a 50-client trainer gets one control, not 50 pills).
    expect(screen.queryByText('Test Sarath Kumar')).toBeNull();
    expect(screen.queryByText('Aiswarya Nair')).toBeNull();
    expect(screen.getByRole('button', { name: /Test Hazeena B/ })).toBeTruthy();
  });

  it('lists every client once opened and filters by search', () => {
    render(<ClientWorkoutCalendar clients={CLIENTS} />);
    fireEvent.click(screen.getByRole('button', { name: /Test Hazeena B/ }));
    expect(screen.getAllByRole('option')).toHaveLength(3);

    fireEvent.change(screen.getByPlaceholderText('Search clients...'), {
      target: { value: 'aisw' },
    });
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('re-scopes the calendar to the client picked from the dropdown', async () => {
    render(<ClientWorkoutCalendar clients={CLIENTS} />);
    await waitFor(() => expect(calls.some((u) => u.includes('/cp-1/workout-calendar'))).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: /Test Hazeena B/ }));
    fireEvent.click(screen.getByRole('option', { name: /Aiswarya Nair/ }));

    await waitFor(() => expect(calls.some((u) => u.includes('/cp-3/workout-calendar'))).toBe(true));
    expect(screen.getByRole('button', { name: /Aiswarya Nair/ })).toBeTruthy();
  });

  it('renders nothing when the trainer has no clients', () => {
    const { container } = render(<ClientWorkoutCalendar clients={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
