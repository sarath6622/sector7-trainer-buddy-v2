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

  // Fire the alert exactly once when the timer ticks from running (>0) to
  // expired (0). Skips the case where we mount onto an already-done timer
  // (prevRemainingRef starts null), so switching tabs onto a rest that
  // completed earlier won't re-buzz the trainer.
  const prevRemainingRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevRemainingRef.current;
    prevRemainingRef.current = remaining;
    if (prev !== null && prev > 0 && remaining === 0 && state.total !== null) {
      fireRestDoneAlert();
    }
  }, [remaining, state.total]);

  // Reset the prev tracker when the active session changes; otherwise a fresh
  // mount could read stale ref state from the previous session's lifecycle.
  useEffect(() => {
    prevRemainingRef.current = null;
  }, [sessionId]);

  function start(seconds: number) {
    // User gesture — unlock the AudioContext so the expiry chime can play
    // without being blocked by the browser autoplay policy.
    unlockAudio();
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
