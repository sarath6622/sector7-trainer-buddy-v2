import { useEffect, useRef } from 'react';

/**
 * Runs `callback` on an interval — but ONLY while the browser tab is visible.
 *
 * Rationale (prod compute): every `setInterval` poller in the app used to keep
 * firing when the tab was backgrounded or the phone was locked, burning Vercel
 * function invocations / Active CPU for data nobody was looking at. This hook
 * clears the interval whenever `document.visibilityState !== 'visible'` and
 * fires `callback` once immediately when the tab becomes visible again (to
 * catch up on anything missed), then resumes the interval.
 *
 * @param callback   Poll function. Its latest identity is always used, so it
 *                   does NOT need to be memoized/stable to avoid restarts.
 * @param intervalMs Poll cadence while visible.
 * @param options.enabled   When false, no polling happens at all (default true).
 * @param options.immediate Fire once on mount if visible (default true).
 */
export function useVisiblePolling(
  callback: () => void,
  intervalMs: number,
  { enabled = true, immediate = true }: { enabled?: boolean; immediate?: boolean } = {},
) {
  const savedCallback = useRef(callback);
  useEffect(() => {
    savedCallback.current = callback;
  });

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === 'undefined') return;

    let intervalId: ReturnType<typeof setInterval> | null = null;
    const tick = () => savedCallback.current();

    const start = () => {
      if (intervalId === null) intervalId = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick(); // catch up immediately on refocus
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === 'visible') {
      if (immediate) tick();
      start();
    }

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs, enabled, immediate]);
}
