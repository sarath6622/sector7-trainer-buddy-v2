'use client';

import { useEffect, useRef, useState } from 'react';
import type { useRestTimer } from '@/hooks/useRestTimer';

/**
 * Surface the most-recently-finished rest timer total in seconds to a workout
 * logger so the next "Add Set" prefills the new row's `restSec`. The consumer
 * clears the published value (`onConsumeRest`) so it isn't reused for sets the
 * user adds long after the rest is over.
 *
 * Resets whenever `activeSessionId` changes — a freshly-ended 90s rest for
 * Session A must not bleed into Session B (the trainer reported this clash
 * when switching tabs).
 */
export function useRestAutofill(
  activeSessionId: string,
  restTimer: ReturnType<typeof useRestTimer>,
) {
  const [lastFinishedRestSec, setLastFinishedRestSec] = useState<number | null>(null);
  const lastTimerTotalRef = useRef<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastFinishedRestSec(null);
    lastTimerTotalRef.current = null;
  }, [activeSessionId]);

  useEffect(() => {
    if (restTimer.total !== null) {
      lastTimerTotalRef.current = restTimer.total;
    }
  }, [restTimer.total]);

  useEffect(() => {
    const cleared = !restTimer.isRunning && !restTimer.isPaused && restTimer.total === null;
    if ((restTimer.isDone || cleared) && lastTimerTotalRef.current !== null) {
      setLastFinishedRestSec(lastTimerTotalRef.current);
    }
  }, [restTimer.isDone, restTimer.isRunning, restTimer.isPaused, restTimer.total]);

  return {
    lastFinishedRestSec,
    consumeRest: () => setLastFinishedRestSec(null),
  };
}
