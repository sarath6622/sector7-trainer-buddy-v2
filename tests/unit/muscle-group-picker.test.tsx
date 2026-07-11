import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MuscleGroupPicker } from '@/components/workout/MuscleGroupPicker';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

const RECENCY_URL = /muscle-group-recency/;
const SUGGESTIONS_URL = /recent-exercises-by-muscle/;

/** fetch stub serving the two endpoints the picker talks to. */
function stubFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (RECENCY_URL.test(url)) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    if (SUGGESTIONS_URL.test(url)) {
      return new Response(
        JSON.stringify({
          data: [
            {
              groupId: 'chest',
              label: 'Chest',
              exercises: [
                {
                  exerciseId: 'ex-bench',
                  name: 'Bench Press',
                  targetMuscleGroup: 'Chest',
                  category: 'Strength',
                  exerciseType: 'WEIGHTED',
                  secondaryMetric: 'NONE',
                  lastSet: null,
                  sessionCount: 3,
                },
              ],
            },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function suggestionCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([input]) => SUGGESTIONS_URL.test(String(input)));
}

describe('MuscleGroupPicker', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('groupsOnly: Continue commits the groups without fetching or showing suggestions', async () => {
    const fetchMock = stubFetch();
    const onGroupsPicked = vi.fn();
    render(
      <MuscleGroupPicker
        clientProfileId="client-1"
        allowCancel={false}
        groupsOnly
        onAdd={vi.fn()}
        onGroupsPicked={onGroupsPicked}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /chest/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    expect(onGroupsPicked).toHaveBeenCalledTimes(1);
    expect(onGroupsPicked).toHaveBeenCalledWith(['chest']);
    // Never advances to the suggested-exercise step and never hits its API.
    expect(screen.queryByText(/suggested for this client/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pick exercises to log/i)).not.toBeInTheDocument();
    expect(suggestionCalls(fetchMock)).toHaveLength(0);
  });

  it('default mode: Continue fetches suggestions and shows the exercises step', async () => {
    const fetchMock = stubFetch();
    const onGroupsPicked = vi.fn();
    render(
      <MuscleGroupPicker
        clientProfileId="client-1"
        allowCancel={false}
        onAdd={vi.fn()}
        onGroupsPicked={onGroupsPicked}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /chest/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/pick exercises to log/i)).toBeInTheDocument();
    });
    expect(onGroupsPicked).toHaveBeenCalledWith(['chest']);
    expect(suggestionCalls(fetchMock)).toHaveLength(1);
    expect(screen.getByText('Bench Press')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add to workout/i })).toBeInTheDocument();
  });

  it.each([{ groupsOnly: true }, { groupsOnly: false }])(
    'Continue is disabled with no groups selected (groupsOnly: $groupsOnly)',
    ({ groupsOnly }) => {
      stubFetch();
      const onGroupsPicked = vi.fn();
      render(
        <MuscleGroupPicker
          clientProfileId="client-1"
          allowCancel={false}
          groupsOnly={groupsOnly}
          onAdd={vi.fn()}
          onGroupsPicked={onGroupsPicked}
        />,
      );

      const continueBtn = screen.getByRole('button', { name: /continue/i });
      expect(continueBtn).toBeDisabled();
      fireEvent.click(continueBtn);
      expect(onGroupsPicked).not.toHaveBeenCalled();
    },
  );
});
