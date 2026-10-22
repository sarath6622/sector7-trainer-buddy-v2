import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RoutineStartCard } from '@/components/routines/RoutineStartCard';

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
    if (url === '/api/routine-programs') {
      return json([{ id: 'lib-1', name: 'Push / Pull / Legs', routines: [] }]);
    }
    if (url === '/api/routine-programs/lib-1' && method === 'GET') {
      return json(program('lib-1', null, 'lib'));
    }
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
    expect(calls.some((c) => c.url === '/api/routine-programs')).toBe(false);

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

    expect(await screen.findByText('No program yet. Starting assigns it to Rohit.')).toBeTruthy();
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
        return String(input) === '/api/routine-programs' ? json([]) : json(null);
      }),
    );
    const { container } = render(
      <RoutineStartCard clientProfileId={CLIENT} sessionInstanceId={SESSION} onApplied={vi.fn()} />,
    );
    await waitFor(() => expect(calls.some((c) => c.url === '/api/routine-programs')).toBe(true));
    expect(container.textContent).toBe('');
  });
});
