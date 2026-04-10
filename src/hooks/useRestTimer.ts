'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface RestTimerState {
  endTime: number | null;
  pausedRemaining: number | null;
  total: number | null;
  updatedAt: number;
}

const EMPTY: RestTimerState = { endTime: null, pausedRemaining: null, total: null, updatedAt: 0 };

function calcRemaining(s: RestTimerState): number | null {
  if (s.pausedRemaining !== null) return s.pausedRemaining;
  if (s.endTime !== null) {
    const r = Math.round((s.endTime - Date.now()) / 1000);
    return r > 0 ? r : 0;
  }
  return null;
}

export function useRestTimer(sessionId: string) {
  const [state, setState] = useState<RestTimerState>(EMPTY);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll — setState is called inside .then() callback which is allowed
  useEffect(() => {
    const url = `/api/sessions/${sessionId}/rest-timer`;
    const poll = () => {
      fetch(url)
        .then((r) => r.json())
        .then(({ data }: { data: RestTimerState }) => setState(data))
        .catch(() => {
          /* silent */
        });
    };
    poll();
    pollRef.current = setInterval(poll, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessionId]);

  const writeState = useCallback(
    async (next: Omit<RestTimerState, 'updatedAt'>) => {
      const payload = { ...next, updatedAt: Date.now() };
      setState(payload);
      try {
        await fetch(`/api/sessions/${sessionId}/rest-timer`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
      } catch {
        /* silent */
      }
    },
    [sessionId],
  );

  const deleteState = useCallback(async () => {
    setState(EMPTY);
    try {
      await fetch(`/api/sessions/${sessionId}/rest-timer`, { method: 'DELETE' });
    } catch {
      /* silent */
    }
  }, [sessionId]);

  const remaining = calcRemaining(state);
  const isRunning = state.endTime !== null && remaining !== null && remaining > 0;
  const isPaused = state.pausedRemaining !== null;
  const isDone = remaining === 0 && state.total !== null;
  const progress = state.total && remaining !== null ? remaining / state.total : 1;

  function start(seconds: number) {
    void writeState({
      endTime: Date.now() + seconds * 1000,
      pausedRemaining: null,
      total: seconds,
    });
  }

  function pause() {
    const r = calcRemaining(state);
    if (r === null) return;
    void writeState({ endTime: null, pausedRemaining: r, total: state.total });
  }

  function resume() {
    if (state.pausedRemaining === null) return;
    void writeState({
      endTime: Date.now() + state.pausedRemaining * 1000,
      pausedRemaining: null,
      total: state.total,
    });
  }

  function stop() {
    void deleteState();
  }

  return {
    remaining,
    isRunning,
    isPaused,
    isDone,
    progress,
    total: state.total,
    start,
    pause,
    resume,
    stop,
  };
}
