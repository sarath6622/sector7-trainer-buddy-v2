'use client';

import { useState, useRef, useEffect } from 'react';

interface SessionTimerProps {
  startedAt: string; // ISO timestamp
  expectedDurationMin: number;
  onTimeComplete?: () => void;
  size?: 'sm' | 'md' | 'lg';
  /** Server-clock ms when the current pause segment started, or null if
   *  running. Combined with `accumulatedPausedSec` lets the timer freeze
   *  while paused without flickering (single floor() on a single Date.now). */
  pausedAt?: number | null;
  /** Server-recorded total paused seconds across previous cycles. */
  accumulatedPausedSec?: number;
}

function pausedMsAtNow(
  nowMs: number,
  pausedAt: number | null | undefined,
  accumulatedPausedSec: number,
): number {
  const live = pausedAt ? Math.max(0, nowMs - pausedAt) : 0;
  return accumulatedPausedSec * 1000 + live;
}

function calcElapsed(
  startedAt: string,
  pausedAt: number | null | undefined,
  accumulatedPausedSec: number,
): number {
  const nowMs = Date.now();
  const startMs = new Date(startedAt).getTime();
  return Math.max(
    0,
    Math.floor((nowMs - startMs - pausedMsAtNow(nowMs, pausedAt, accumulatedPausedSec)) / 1000),
  );
}

function formatTime(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function useElapsedTimer(
  startedAt: string,
  pausedAt: number | null | undefined,
  accumulatedPausedSec: number,
  expectedSec?: number,
  onTimeComplete?: () => void,
) {
  const [elapsedSec, setElapsedSec] = useState(() =>
    calcElapsed(startedAt, pausedAt, accumulatedPausedSec),
  );
  const notifiedRef = useRef(false);
  const onTimeCompleteRef = useRef(onTimeComplete);

  useEffect(() => {
    onTimeCompleteRef.current = onTimeComplete;
  }, [onTimeComplete]);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = calcElapsed(startedAt, pausedAt, accumulatedPausedSec);
      setElapsedSec(elapsed);

      if (
        expectedSec &&
        elapsed >= expectedSec &&
        !notifiedRef.current &&
        onTimeCompleteRef.current
      ) {
        notifiedRef.current = true;
        onTimeCompleteRef.current();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt, pausedAt, accumulatedPausedSec, expectedSec]);

  return elapsedSec;
}

export function SessionTimer({
  startedAt,
  expectedDurationMin,
  onTimeComplete,
  size = 'lg',
  pausedAt = null,
  accumulatedPausedSec = 0,
}: SessionTimerProps) {
  const expectedSec = expectedDurationMin * 60;
  const elapsedSec = useElapsedTimer(
    startedAt,
    pausedAt,
    accumulatedPausedSec,
    expectedSec,
    onTimeComplete,
  );

  const isOvertime = elapsedSec >= expectedSec;
  const progressPercent = Math.min((elapsedSec / expectedSec) * 100, 100);

  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-3xl',
    lg: 'text-5xl',
  };

  const ringSize = {
    sm: 80,
    md: 140,
    lg: 200,
  };

  const r = ringSize[size];
  const strokeWidth = size === 'sm' ? 4 : size === 'md' ? 6 : 8;
  const radius = (r - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progressPercent / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Circular progress ring */}
      <div className="relative" style={{ width: r, height: r }}>
        <svg width={r} height={r} className="-rotate-90">
          {/* Background ring */}
          <circle
            cx={r / 2}
            cy={r / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted"
          />
          {/* Progress ring */}
          <circle
            cx={r / 2}
            cy={r / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className={isOvertime ? 'text-destructive' : 'text-primary'}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        {/* Timer display centered */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`font-mono font-bold tabular-nums ${sizeClasses[size]} ${isOvertime ? 'text-destructive' : 'text-foreground'}`}
          >
            {formatTime(elapsedSec)}
          </span>
          {size !== 'sm' && (
            <span className="text-xs text-muted-foreground mt-1">/ {formatTime(expectedSec)}</span>
          )}
        </div>
      </div>

      {/* Status message */}
      {isOvertime && (
        <p className="text-sm font-medium text-destructive animate-pulse">
          PT time completed — overtime by {formatTime(elapsedSec - expectedSec)}
        </p>
      )}
    </div>
  );
}

/**
 * Compact inline timer display (no ring)
 */
export function InlineTimer({
  startedAt,
  expectedDurationMin,
  pausedAt = null,
  accumulatedPausedSec = 0,
}: {
  startedAt: string;
  expectedDurationMin: number;
  /** Server-clock ms of the current pause segment (or null when running).
   *  Same semantics as SessionTimer's matching prop — combined with
   *  accumulatedPausedSec lets the timer freeze without flickering. */
  pausedAt?: number | null;
  accumulatedPausedSec?: number;
}) {
  const expectedSec = expectedDurationMin * 60;
  const elapsedSec = useElapsedTimer(startedAt, pausedAt, accumulatedPausedSec);
  const isOvertime = elapsedSec >= expectedSec;

  return (
    <span className={`font-mono tabular-nums ${isOvertime ? 'text-destructive' : 'text-primary'}`}>
      {formatTime(elapsedSec)}
    </span>
  );
}
