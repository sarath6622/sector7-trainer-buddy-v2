'use client';

import { useState } from 'react';
import { BedDouble, Pause, Play, X } from 'lucide-react';
import type { useRestTimer } from '@/hooks/useRestTimer';

const REST_PRESETS = [
  { label: '1 min', seconds: 60 },
  { label: '2 min', seconds: 120 },
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
];

/**
 * Inline rest-timer chip — sits inside the trainer page's bottom dock above
 * the workout logger. Shows MM:SS or "Rest done!" with Expand / Stop controls.
 *
 * The client page uses `RestTimerPillFloating` instead (different anchoring).
 */
export function RestTimerPillInline({
  remaining,
  isPaused,
  isDone,
  onOpen,
  onStop,
}: {
  remaining: number | null;
  isPaused: boolean;
  isDone: boolean;
  onOpen: () => void;
  onStop: () => void;
}) {
  if (remaining === null && !isDone) return null;
  const mins = remaining !== null ? Math.floor(remaining / 60) : 0;
  const secs = remaining !== null ? remaining % 60 : 0;
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 mb-2 border ${
        isDone ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-blue-500/10 border-blue-500/20'
      }`}
    >
      <BedDouble className={`h-4 w-4 shrink-0 ${isDone ? 'text-emerald-400' : 'text-blue-400'}`} />
      {isDone ? (
        <span className="flex-1 text-sm font-bold text-emerald-400">Rest done!</span>
      ) : (
        <span className="flex-1 text-sm font-black tabular-nums text-white">
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          {isPaused && <span className="ml-1.5 text-[10px] font-normal text-white/40">paused</span>}
        </span>
      )}
      <button
        onClick={onOpen}
        className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
      >
        Expand
      </button>
      <div className="w-px h-4 bg-white/15" />
      <button onClick={onStop} className="text-white/40 hover:text-red-400 transition-colors">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Floating rest-timer pill — anchored at the bottom of the viewport. Used by
 * the client session page where there is no bottom dock to sit inside.
 */
export function RestTimerPillFloating({
  remaining,
  isPaused,
  isDone,
  onOpen,
  onStop,
}: {
  remaining: number | null;
  isPaused: boolean;
  isDone: boolean;
  onOpen: () => void;
  onStop: () => void;
}) {
  if (remaining === null && !isDone) return null;
  const mins = remaining !== null ? Math.floor(remaining / 60) : 0;
  const secs = remaining !== null ? remaining % 60 : 0;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-zinc-900 border border-white/15 shadow-2xl px-4 py-2.5">
      <BedDouble className={`h-4 w-4 ${isDone ? 'text-emerald-400' : 'text-blue-400'}`} />
      {isDone ? (
        <span className="text-sm font-bold text-emerald-400">Rest done!</span>
      ) : (
        <span className="text-sm font-black tabular-nums text-white">
          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          {isPaused && <span className="ml-1.5 text-[10px] font-normal text-white/40">paused</span>}
        </span>
      )}
      <button
        onClick={onOpen}
        className="text-xs text-white/50 hover:text-white transition-colors px-1"
      >
        Open
      </button>
      <div className="w-px h-4 bg-white/15" />
      <button onClick={onStop} className="text-white/40 hover:text-red-400 transition-colors">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Shared rest-timer bottom sheet. Identical UI for trainer and client.
 */
export function RestTimerSheet({
  onClose,
  timer,
}: {
  onClose: () => void;
  timer: ReturnType<typeof useRestTimer>;
}) {
  const [custom, setCustom] = useState('');
  const { remaining, isRunning, isPaused, isDone, progress, total, start, pause, resume, stop } =
    timer;
  const mins = remaining !== null ? Math.floor(remaining / 60) : 0;
  const secs = remaining !== null ? remaining % 60 : 0;
  const circumference = 2 * Math.PI * 54;

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-900 rounded-t-3xl border-t border-white/10 pb-safe">
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mt-3 mb-1" />
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <BedDouble className="h-4 w-4 text-blue-400" />
            <p className="font-bold text-sm">Rest Timer</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-5 space-y-5">
          <div className="flex flex-col items-center gap-3">
            <div className="relative w-36 h-36">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="8"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  fill="none"
                  stroke={isDone ? '#22c55e' : '#3b82f6'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - progress)}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {isDone ? (
                  <p className="text-lg font-bold text-emerald-400">Done!</p>
                ) : remaining !== null ? (
                  <>
                    <p className="text-3xl font-black tabular-nums text-white">
                      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
                    </p>
                    <p className="text-[10px] text-white/40 mt-0.5">
                      {isPaused ? 'paused' : 'remaining'}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-white/30">pick a time</p>
                )}
              </div>
            </div>
            {(isRunning || isPaused) && !isDone && (
              <div className="flex items-center gap-3">
                <button
                  onClick={isPaused ? resume : pause}
                  className="flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2 text-sm font-semibold transition-colors"
                >
                  {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
                <button
                  onClick={stop}
                  className="flex items-center gap-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 px-4 py-2 text-sm font-semibold transition-colors"
                >
                  <X className="h-4 w-4" />
                  Stop
                </button>
              </div>
            )}
            {isDone && (
              <button
                onClick={stop}
                className="rounded-xl bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 px-5 py-2 text-sm font-semibold transition-colors"
              >
                Reset
              </button>
            )}
          </div>
          <div>
            <p className="text-xs text-white/40 font-semibold uppercase tracking-wide mb-2">
              Quick select
            </p>
            <div className="grid grid-cols-4 gap-2">
              {REST_PRESETS.map((p) => (
                <button
                  key={p.seconds}
                  onClick={() => {
                    setCustom('');
                    start(p.seconds);
                  }}
                  className={`rounded-2xl py-3 text-sm font-bold transition-colors ${
                    total === p.seconds && (isRunning || isPaused)
                      ? 'bg-blue-500 text-white'
                      : 'bg-white/[0.08] text-white/70 hover:bg-white/15'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-white/40 font-semibold uppercase tracking-wide mb-2">
              Custom (seconds)
            </p>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="e.g. 90"
                className="flex-1 rounded-xl bg-white/[0.08] border border-white/10 px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => {
                  const s = parseInt(custom, 10);
                  if (s > 0) start(s);
                }}
                disabled={!custom || parseInt(custom, 10) <= 0}
                className="rounded-xl bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 text-sm font-semibold text-white transition-colors"
              >
                Start
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
