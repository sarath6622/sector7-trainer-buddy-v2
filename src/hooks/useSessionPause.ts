'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { usePusherChannel } from '@/hooks/usePusherChannel';

// Server-driven session pause state. Mirrors `useRestTimer`'s patterns:
// hydrate on mount, subscribe to Pusher for live updates, optimistically
// apply mutations and let the server echo reconcile via a monotonic
// `updatedAt` guard. Both trainer and client surfaces consume this hook so
// the pause state stays in lockstep across devices.

export interface SessionPauseState {
  pausedAt: number | null; // ms since epoch, server-clock
  accumulatedPausedSec: number;
  updatedAt: number;
}

const EMPTY: SessionPauseState = {
  pausedAt: null,
  accumulatedPausedSec: 0,
  updatedAt: 0,
};

interface PusherUpdatePayload {
  pausedAt: number | null;
  accumulatedPausedSec: number;
  updatedAt: number;
  serverNow: number;
}

export function useSessionPause(sessionId: string) {
  const [state, setState] = useState<SessionPauseState>(EMPTY);
  const [skew, setSkew] = useState(0); // serverNow - clientNow, ms
  const [now, setNow] = useState(() => Date.now());

  const skewRef = useRef(skew);
  useEffect(() => {
    skewRef.current = skew;
  }, [skew]);

  // Reset state when consumer swaps to a different session — same reasoning
  // as useRestTimer: each session has its own monotonic timeline, so the
  // guard would otherwise reject the new session's first hydrate.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(EMPTY);
  }, [sessionId]);

  const applyServerState = useCallback((next: SessionPauseState, serverNow?: number) => {
    if (typeof serverNow === 'number') {
      setSkew(serverNow - Date.now());
    }
    setNow(Date.now());
    setState((prev) => (next.updatedAt >= prev.updatedAt ? next : prev));
  }, []);

  // Hydrate + 30s keepalive (Pusher-down fallback)
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/pause`);
        if (!res.ok) return;
        const body = (await res.json()) as { data: SessionPauseState; serverNow: number };
        if (cancelled) return;
        applyServerState(body.data ?? EMPTY, body.serverNow);
      } catch {
        /* silent — keepalive will retry */
      }
    };
    void hydrate();
    const id = setInterval(hydrate, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId, applyServerState]);

  // Pusher subscription
  const channelEvents = useMemo(
    () => ({
      SESSION_PAUSE_UPDATED: (raw: unknown) => {
        const p = raw as PusherUpdatePayload;
        applyServerState(
          {
            pausedAt: p.pausedAt,
            accumulatedPausedSec: p.accumulatedPausedSec,
            updatedAt: p.updatedAt,
          },
          p.serverNow,
        );
      },
    }),
    [applyServerState],
  );
  usePusherChannel(`session-${sessionId}`, channelEvents);

  // 1Hz tick while paused so the live "paused for X" counter advances. When
  // running we don't need a tick — accumulatedPausedSec is static.
  const isPaused = state.pausedAt !== null;
  useEffect(() => {
    if (!isPaused) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isPaused]);

  // Total paused seconds — accumulator + current in-flight pause segment.
  const totalPausedSec = useMemo(() => {
    if (state.pausedAt === null) return state.accumulatedPausedSec;
    const live = Math.max(0, Math.floor((now + skew - state.pausedAt) / 1000));
    return state.accumulatedPausedSec + live;
  }, [state, now, skew]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  // Single POST endpoint toggles pause/resume. Optimistic local update so
  // the UI snaps immediately; server echo reconciles via the guard.

  const toggle = useCallback(async () => {
    const wasPaused = state.pausedAt !== null;
    const optimisticAt = Date.now() + skewRef.current;
    setState({
      pausedAt: wasPaused ? null : optimisticAt,
      accumulatedPausedSec: wasPaused
        ? state.accumulatedPausedSec +
          Math.max(0, Math.floor((Date.now() + skewRef.current - state.pausedAt!) / 1000))
        : state.accumulatedPausedSec,
      updatedAt: optimisticAt,
    });
    setNow(Date.now());
    try {
      const res = await fetch(`/api/sessions/${sessionId}/pause`, { method: 'POST' });
      if (res.ok) {
        const body = (await res.json()) as { data: SessionPauseState; serverNow: number };
        applyServerState(body.data, body.serverNow);
      }
    } catch {
      /* silent — Pusher echo or keepalive will reconcile */
    }
  }, [sessionId, state, applyServerState]);

  return {
    isPaused,
    pausedAt: state.pausedAt,
    accumulatedPausedSec: state.accumulatedPausedSec,
    /** Total paused time in seconds, including any in-flight pause segment. */
    totalPausedSec,
    /** Toggle pause ↔ resume. Server decides which based on current state. */
    toggle,
  };
}
