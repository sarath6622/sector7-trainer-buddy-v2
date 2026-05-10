'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { usePusherChannel } from '@/hooks/usePusherChannel';

// All timestamps in this hook are **server-clock ms**. The local hook tracks
// `skew = serverNow - clientNow` (refreshed on every hydrate / push event)
// and translates between clocks so the countdown shown on different devices
// agrees regardless of phone wall-clock drift.

export interface RestTimerState {
  endTime: number | null;
  pausedRemaining: number | null;
  total: number | null;
  updatedAt: number;
}

const EMPTY: RestTimerState = {
  endTime: null,
  pausedRemaining: null,
  total: null,
  updatedAt: 0,
};

// ── Rest-done alert (vibration + Web Audio chime) ────────────────────────────
// Browsers gate audio behind a user gesture, so we cache a single AudioContext
// and unlock it the first time the user taps Start. Without that the chime
// would silently fail on the timer-expiry tick (no fresh gesture there).

let cachedAudioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (cachedAudioCtx) return cachedAudioCtx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    cachedAudioCtx = new Ctor();
    return cachedAudioCtx;
  } catch {
    return null;
  }
}

function unlockAudio() {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
}

function playRestDoneChime() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  const t0 = ctx.currentTime;
  const beep = (freq: number, start: number, dur: number, peak = 0.22) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + start);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + start);
    osc.stop(t0 + start + dur + 0.02);
  };
  beep(880, 0, 0.18);
  beep(880, 0.22, 0.18);
  beep(1175, 0.44, 0.34, 0.26);
}

function fireRestDoneAlert() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([180, 90, 180, 90, 360]);
    }
  } catch {
    /* ignore */
  }
  try {
    playRestDoneChime();
  } catch {
    /* ignore */
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

interface PusherUpdatePayload {
  endTime: number | null;
  pausedRemaining: number | null;
  total: number | null;
  updatedAt: number;
  serverNow: number;
}

export interface UseRestTimerOptions {
  /** Suppresses the rest-done buzz + chime when this hook's countdown
   *  hits zero. Used for inactive-session chips that visualize peer
   *  clients' rest state — vibrating the trainer's phone for someone
   *  else's rest ending is the deferred "cross-session alert" feature. */
  silent?: boolean;
}

export function useRestTimer(sessionId: string, options: UseRestTimerOptions = {}) {
  const { silent = false } = options;
  const [state, setState] = useState<RestTimerState>(EMPTY);
  const [skew, setSkew] = useState(0); // serverNow - clientNow, ms
  // Renders the countdown at 1Hz while running. The interval is only armed
  // while a timer is active, so `now` would otherwise drift during idle gaps —
  // start/resume/applyServerState all reseed it before the first render of a
  // newly-active timer to avoid a one-frame glitch where the previous stale
  // `now` makes `endTime - now` look minutes too large.
  const [now, setNow] = useState(() => Date.now());

  // Keep the latest skew/state accessible from imperative callers (start/
  // pause/etc.) without rebuilding callbacks on every render. Assignments are
  // made in an effect rather than during render — the React lint rule
  // (`react-hooks/no-set-state-in-render`) forbids ref writes in render.
  const skewRef = useRef(skew);
  const stateRef = useRef(state);
  useEffect(() => {
    skewRef.current = skew;
  }, [skew]);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Drop incoming snapshots that are older than what we already have. The
  // server `updatedAt` advances monotonically per session, so the stalest
  // delivery (late Pusher event vs hydrate vs optimistic write) loses cleanly.
  const applyServerState = useCallback((next: RestTimerState, serverNow?: number) => {
    if (typeof serverNow === 'number') {
      setSkew(serverNow - Date.now());
    }
    setNow(Date.now());
    setState((prev) => (next.updatedAt >= prev.updatedAt ? next : prev));
  }, []);

  // ── Hydrate on mount + 30s keepalive (Pusher-down fallback) ────────────────
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/rest-timer`);
        if (!res.ok) return;
        const body = (await res.json()) as { data: RestTimerState; serverNow: number };
        if (cancelled) return;
        applyServerState(body.data ?? EMPTY, body.serverNow);
      } catch {
        /* silent — the keepalive will retry */
      }
    };
    void hydrate();
    const id = setInterval(hydrate, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sessionId, applyServerState]);

  // ── Push subscription ─────────────────────────────────────────────────────
  // Memo the handler map so the channel hook's effect only re-binds when the
  // session changes, not on every render.
  const channelEvents = useMemo(
    () => ({
      REST_TIMER_UPDATED: (raw: unknown) => {
        const p = raw as PusherUpdatePayload;
        applyServerState(
          {
            endTime: p.endTime,
            pausedRemaining: p.pausedRemaining,
            total: p.total,
            updatedAt: p.updatedAt,
          },
          p.serverNow,
        );
      },
    }),
    [applyServerState],
  );
  usePusherChannel(`session-${sessionId}`, channelEvents);

  // ── Countdown driver — 1Hz while running, idle otherwise ──────────────────
  // No interval when paused / cleared, so we don't churn renders for nothing.
  const isCountingDown = state.endTime !== null && state.pausedRemaining === null;
  useEffect(() => {
    if (!isCountingDown) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isCountingDown]);

  // ── Derived view ──────────────────────────────────────────────────────────
  const remaining = useMemo<number | null>(() => {
    if (state.pausedRemaining !== null) return state.pausedRemaining;
    if (state.endTime !== null) {
      const r = Math.round((state.endTime - (now + skew)) / 1000);
      return r > 0 ? r : 0;
    }
    return null;
  }, [state, now, skew]);

  const isRunning = state.endTime !== null && remaining !== null && remaining > 0;
  const isPaused = state.pausedRemaining !== null;
  const isDone = remaining === 0 && state.total !== null;
  const progress = state.total && remaining !== null ? remaining / state.total : 1;

  // ── Done-alert: fire once when the countdown crosses >0 → 0 ───────────────
  // prevRemainingRef starts null so we don't buzz on a fresh mount onto an
  // already-expired timer (e.g. trainer reopens the page after rest finished).
  const prevRemainingRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevRemainingRef.current;
    prevRemainingRef.current = remaining;
    if (prev !== null && prev > 0 && remaining === 0 && state.total !== null && !silent) {
      fireRestDoneAlert();
    }
  }, [remaining, state.total, silent]);

  // Reset everything when the consumer swaps to a different session. Each
  // session has its own independent `updatedAt` timeline on the server, so
  // the monotonic guard inside `applyServerState` would otherwise reject
  // the new session's first hydrate (older timestamp) and the previous
  // client's timer would stick on screen — exactly the cross-tab clash the
  // trainer reported.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(EMPTY);
    prevRemainingRef.current = null;
  }, [sessionId]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  // All payloads are sent in server-clock time. We optimistically update local
  // state with a server-time `updatedAt` so the Pusher echo from our own write
  // (which has a marginally later updatedAt) cleanly supersedes it.
  const writeServer = useCallback(
    async (next: Omit<RestTimerState, 'updatedAt'>) => {
      const optimisticAt = Date.now() + skewRef.current;
      const optimistic: RestTimerState = { ...next, updatedAt: optimisticAt };
      setNow(Date.now());
      setState((prev) => (optimistic.updatedAt >= prev.updatedAt ? optimistic : prev));
      try {
        const res = await fetch(`/api/sessions/${sessionId}/rest-timer`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
        if (res.ok) {
          const body = (await res.json()) as { data: RestTimerState; serverNow: number };
          applyServerState(body.data, body.serverNow);
        }
      } catch {
        /* silent — Pusher echo or keepalive will reconcile */
      }
    },
    [sessionId, applyServerState],
  );

  const clearServer = useCallback(async () => {
    setState({
      endTime: null,
      pausedRemaining: null,
      total: null,
      updatedAt: Date.now() + skewRef.current,
    });
    try {
      await fetch(`/api/sessions/${sessionId}/rest-timer`, { method: 'DELETE' });
    } catch {
      /* silent */
    }
  }, [sessionId]);

  const start = useCallback(
    (seconds: number) => {
      // User gesture — unlock the AudioContext so the expiry chime can play
      // without being blocked by the browser autoplay policy.
      unlockAudio();
      const endTime = Date.now() + skewRef.current + seconds * 1000;
      void writeServer({ endTime, pausedRemaining: null, total: seconds });
    },
    [writeServer],
  );

  const pause = useCallback(() => {
    // Compute remaining at click-time from the live endTime and current skew —
    // not from React state, which can lag the clock by up to a render frame.
    const s = stateRef.current;
    if (s.endTime === null) return;
    const r = Math.round((s.endTime - (Date.now() + skewRef.current)) / 1000);
    if (r <= 0) return;
    void writeServer({ endTime: null, pausedRemaining: r, total: s.total });
  }, [writeServer]);

  const resume = useCallback(() => {
    const s = stateRef.current;
    if (s.pausedRemaining === null) return;
    const endTime = Date.now() + skewRef.current + s.pausedRemaining * 1000;
    void writeServer({ endTime, pausedRemaining: null, total: s.total });
  }, [writeServer]);

  const stop = useCallback(() => {
    void clearServer();
  }, [clearServer]);

  return {
    remaining,
    isRunning,
    isPaused,
    isDone,
    progress,
    total: state.total,
    /** Server-clock ms when the countdown was scheduled to hit zero. When
     *  `isDone` is true this is in the past — consumers can use it to
     *  compute "how long ago did the rest end" and escalate visual urgency
     *  as the trainer leaves the client unattended. */
    endTime: state.endTime,
    start,
    pause,
    resume,
    stop,
  };
}
