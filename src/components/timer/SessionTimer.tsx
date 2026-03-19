'use client';

import { useState, useRef, useEffect } from 'react';

interface SessionTimerProps {
  startedAt: string; // ISO timestamp
  expectedDurationMin: number;
  onTimeComplete?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

function calcElapsed(startedAt: string): number {
  return Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
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

function useElapsedTimer(startedAt: string, expectedSec?: number, onTimeComplete?: () => void) {
  const [elapsedSec, setElapsedSec] = useState(() => calcElapsed(startedAt));
  const notifiedRef = useRef(false);
  const onTimeCompleteRef = useRef(onTimeComplete);

  useEffect(() => {
    onTimeCompleteRef.current = onTimeComplete;
  }, [onTimeComplete]);

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = calcElapsed(startedAt);
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
  }, [startedAt, expectedSec]);

  return elapsedSec;
}

export function SessionTimer({
  startedAt,
  expectedDurationMin,
  onTimeComplete,
  size = 'lg',
}: SessionTimerProps) {
  const expectedSec = expectedDurationMin * 60;
  const elapsedSec = useElapsedTimer(startedAt, expectedSec, onTimeComplete);

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
}: {
  startedAt: string;
  expectedDurationMin: number;
}) {
  const expectedSec = expectedDurationMin * 60;
  const elapsedSec = useElapsedTimer(startedAt);
  const isOvertime = elapsedSec >= expectedSec;

  return (
    <span className={`font-mono tabular-nums ${isOvertime ? 'text-destructive' : 'text-primary'}`}>
      {formatTime(elapsedSec)}
    </span>
  );
}
