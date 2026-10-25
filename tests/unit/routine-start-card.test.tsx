import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RoutineStartCard, clearRoutineSourceCache } from '@/components/routines/RoutineStartCard';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

const CLIENT = 'client-1';
const SESSION = 'sess-1';

function set(n: number, min: number, max: number) {
  return {
    setNumber: n,
    setType: 'NORMAL',
    targetRepsMin: min,
    targetRepsMax: max,
    targetWeightKg: null,
    targetDurationSec: null,
    targetStepsCount: null,
    targetDistance: null,
  };
}

function routine(id: string, name: string, orderIndex: number, exerciseName: string) {
  return {
    id,
    name,
    notes: null,
    orderIndex,
    exercises: [
      {
        id: `${id}-e1`,
        exerciseId: `ex-${exerciseName}`,
        orderIndex: 0,
        restSec: 60,
        notes: null,
        exercise: {
          id: `ex-${exerciseName}`,
          name: exerciseName,
          targetMuscleGroup: 'Chest',
          category: 'STRENGTH',
          exerciseType: 'WEIGHTED',
          secondaryMetric: 'KM',
        },
        sets: [set(1, 12, 15), set(2, 12, 15), set(3, 12, 15)],
      },
    ],
  };
}

function program(id: string, clientProfileId: string | null, prefix: string) {
  return {
    id,
    name: 'Push / Pull / Legs',
    notes: null,
    clientProfileId,
    sourceProgramId: null,
    isActive: true,
    isArchived: false,
    updatedAt: '2026-10-19T00:00:00.000Z',
    routines: [
      routine(`${prefix}-a`, 'Push Day', 0, 'Bench Press'),
      routine(`${prefix}-b`, 'Pull Day', 1, 'Lat Pulldown'),
    ],
  };
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status });

let calls: { url: string; method: string; body?: string }[];

function stubFetch(clientProgram: unknown) {
  calls = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body as string | undefined });
    if (url === `/api/routine-programs/clients/${CLIENT}`) return json(clientProgram);
    if (url === '/api/routine-programs?detail=true&limit=6')
      return json([program('lib-1', null, 'lib')]);
    if (url === '/api/routine-programs/lib-1/assign') {
      return json(program('copy-1', CLIENT, 'copy'), 201);
    }
    if (url === `/api/sessions/${SESSION}/routine`) {
      return json({ routineId: 'x', addedExerciseIds: ['ex-1'], skippedExerciseIds: [] });
    }
    return new Response('{}', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
}

beforeEach(() => {
  vi.unstubAllGlobals();
  clearRoutineSourceCache();
});

describe('RoutineStartCard', () => {
  it("shows the client's Next-up routine with its exercise targets, and applies it", async () => {
    stubFetch({ ...program('copy-1', CLIENT, 'copy'), nextRoutineId: 'copy-b', lastUsed: null });
    const onApplied = vi.fn();
    render(
      <RoutineStartCard
        clientProfileId={CLIENT}
        sessionInstanceId={SESSION}
        onApplied={onApplied}
      />,
    );

    expect(await screen.findByRole('button', { name: /Start Pull Day/ })).toBeTruthy();
    expect(screen.getByText('Lat Pulldown')).toBeTruthy();
    expect(screen.getByText(/3 × 12–15 reps · rest 1 min/)).toBeTruthy();
    // No library fallback when the client has a program.
    expect(calls.some((c) => c.url.startsWith('/api/routine-programs?'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: /Start Pull Day/ }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const apply = calls.find((c) => c.url === `/api/sessions/${SESSION}/routine`);
    expect(JSON.parse(apply?.body ?? '{}')).toEqual({ routineId: 'copy-b' });
  });

  it('switches the previewed routine with the day chips', async () => {
    stubFetch({ ...program('copy-1', CLIENT, 'copy'), nextRoutineId: 'copy-b', lastUsed: null });
    render(
      <RoutineStartCard clientProfileId={CLIENT} sessionInstanceId={SESSION} onApplied={vi.fn()} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Push Day/ }));
    expect(screen.getByText('Bench Press')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start Push Day/ })).toBeTruthy();
  });

  it('falls back to the library when the client has no program, then assigns + applies', async () => {
    stubFetch(null);
    const onApplied = vi.fn();
    render(
      <RoutineStartCard
        clientProfileId={CLIENT}
        clientName="Rohit"
        sessionInstanceId={SESSION}
        onApplied={onApplied}
      />,
    );

    // One program in the library → straight to choosing the day, with the
    // assignment spelled out under the Start button.
    expect(
      await screen.findByText(
        'Assigns Push / Pull / Legs to Rohit. Next sessions continue the rotation.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Pull Day/ }));
    fireEvent.click(screen.getByRole('button', { name: /Start Pull Day/ }));

    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    const assign = calls.find((c) => c.url === '/api/routine-programs/lib-1/assign');
    expect(JSON.parse(assign?.body ?? '{}')).toEqual({ clientProfileId: CLIENT });
    // Applies the routine from the NEW COPY at the same position, not the template's id.
    const apply = calls.find((c) => c.url === `/api/sessions/${SESSION}/routine`);
    expect(JSON.parse(apply?.body ?? '{}')).toEqual({ routineId: 'copy-b' });
    expect(calls.findIndex((c) => c === assign)).toBeLessThan(calls.findIndex((c) => c === apply));
  });

  it('renders nothing when there is no program and the library is empty', async () => {
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        calls.push({ url: String(input), method: 'GET' });
        return String(input) === '/api/routine-programs?detail=true&limit=6'
          ? json([])
          : json(null);
      }),
    );
    const { container } = render(
      <RoutineStartCard clientProfileId={CLIENT} sessionInstanceId={SESSION} onApplied={vi.fn()} />,
    );
    await waitFor(() =>
      expect(calls.some((c) => c.url === '/api/routine-programs?detail=true&limit=6')).toBe(true),
    );
    await waitFor(() => expect(container.querySelector('[aria-busy]')).toBeNull());
    expect(container.textContent).toBe('');
  });

  it('asks to choose a program first when the library has several, then shows its days', async () => {
    calls = [];
    const second = { ...program('lib-2', null, 'ul'), name: 'Upper / Lower' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push({ url, method: 'GET' });
        if (url === `/api/routine-programs/clients/${CLIENT}`) return json(null);
        if (url === '/api/routine-programs?detail=true&limit=6')
          return json([second, program('lib-1', null, 'lib')]);
        return new Response('{}', { status: 404 });
      }),
    );
    render(
      <RoutineStartCard
        clientProfileId={CLIENT}
        clientName="Rohit"
        sessionInstanceId={SESSION}
        onApplied={vi.fn()}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Choose a program' })).toBeTruthy();
    expect(screen.getByText(/Rohit doesn.t have one yet/)).toBeTruthy();
    // No day list or Start button until a program is picked.
    expect(screen.queryByRole('button', { name: /^Start / })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Upper \/ Lower/ }));
    expect(screen.getByRole('button', { name: /Start Push Day/ })).toBeTruthy();
    expect(screen.getByText('All programs')).toBeTruthy();

    fireEvent.click(screen.getByText('All programs'));
    expect(screen.getByRole('heading', { name: 'Choose a program' })).toBeTruthy();
  });

  it('"Log without a program" hides the card for the session', async () => {
    calls = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `/api/routine-programs/clients/${CLIENT}`) return json(null);
        if (url === '/api/routine-programs?detail=true&limit=6') {
          return json([program('lib-1', null, 'a'), program('lib-2', null, 'b')]);
        }
        return new Response('{}', { status: 404 });
      }),
    );
    const { container } = render(
      <RoutineStartCard clientProfileId={CLIENT} sessionInstanceId={SESSION} onApplied={vi.fn()} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Log without a program' }));
    expect(container.textContent).toBe('');
  });

  it('shows a skeleton while loading instead of popping in late', async () => {
    stubFetch({ ...program('copy-1', CLIENT, 'copy'), nextRoutineId: 'copy-b', lastUsed: null });
    render(
      <RoutineStartCard clientProfileId={CLIENT} sessionInstanceId={SESSION} onApplied={vi.fn()} />,
    );
    expect(screen.getByLabelText('Loading routines')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Start Pull Day/ })).toBeTruthy();
    expect(screen.queryByLabelText('Loading routines')).toBeNull();
  });

  it('loads the library in one request, not one per program', async () => {
    stubFetch(null);
    render(
      <RoutineStartCard clientProfileId={CLIENT} sessionInstanceId={SESSION} onApplied={vi.fn()} />,
    );
    await screen.findByRole('button', { name: /Start Push Day/ });
    expect(calls.map((c) => c.url)).toEqual([
      `/api/routine-programs/clients/${CLIENT}`,
      '/api/routine-programs?detail=true&limit=6',
    ]);
  });

  it('renders the cached routine immediately on remount', async () => {
    stubFetch({ ...program('copy-1', CLIENT, 'copy'), nextRoutineId: 'copy-b', lastUsed: null });
    const first = render(
      <RoutineStartCard clientProfileId={CLIENT} sessionInstanceId={SESSION} onApplied={vi.fn()} />,
    );
    await screen.findByRole('button', { name: /Start Pull Day/ });
    first.unmount();

    render(
      <RoutineStartCard clientProfileId={CLIENT} sessionInstanceId={SESSION} onApplied={vi.fn()} />,
    );
    // Synchronously — no skeleton, no wait.
    expect(screen.getByRole('button', { name: /Start Pull Day/ })).toBeTruthy();
    expect(screen.queryByLabelText('Loading routines')).toBeNull();
  });
});
