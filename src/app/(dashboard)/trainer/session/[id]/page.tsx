'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { Square, BedDouble, Pause, Play, X } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { WorkoutLogger } from '@/components/workout/WorkoutLogger';
import { BadgeCelebration } from '@/components/badges/BadgeCelebration';
import { useRestTimer } from '@/hooks/useRestTimer';
import { usePusherChannel } from '@/hooks/usePusherChannel';
import type { SessionStartedPayload, SessionEndedPayload } from '@/lib/pusher';

const REST_PRESETS = [
  { label: '1 min', seconds: 60 },
  { label: '2 min', seconds: 120 },
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
];

function RestTimerPill({
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
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 mb-2 border ${isDone ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}
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

function RestTimerSheet({
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
                  className={`rounded-2xl py-3 text-sm font-bold transition-colors ${total === p.seconds && (isRunning || isPaused) ? 'bg-blue-500 text-white' : 'bg-white/[0.08] text-white/70 hover:bg-white/15'}`}
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

interface SessionData {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  status: string;
  startedAt?: string;
  client: {
    id: string;
    user: { firstName: string; lastName: string };
  };
  trainer: {
    user: { firstName: string; lastName: string };
  };
  workoutLogs?: {
    id: string;
    exerciseId: string;
    orderIndex: number;
    updatedAt?: string;
    exercise: {
      id: string;
      name: string;
      targetMuscleGroup: string;
      category: string;
      exerciseType: 'WEIGHTED' | 'BODYWEIGHT' | 'DURATION' | 'CARDIO';
    };
    sets: {
      setNumber: number;
      reps: number | null;
      weightKg: number | null;
      durationSec: number | null;
      rpe: number | null;
      notes: string | null;
      createdAt?: string;
    }[];
  }[];
}

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

function lastActivityMs(s: SessionData | undefined): number | null {
  if (!s?.startedAt) return null;
  let latest = new Date(s.startedAt).getTime();
  for (const log of s.workoutLogs ?? []) {
    if (log.updatedAt) {
      const t = new Date(log.updatedAt).getTime();
      if (t > latest) latest = t;
    }
    for (const set of log.sets ?? []) {
      if (set.createdAt) {
        const t = new Date(set.createdAt).getTime();
        if (t > latest) latest = t;
      }
    }
  }
  return latest;
}

function formatIdle(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${hr}h` : `${hr}h${rem}m`;
}

function formatElapsed(startedAt: string, nowMs: number): string {
  const sec = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hrs > 0 ? `${hrs}:${mm}:${ss}` : `${mm}:${ss}`;
}

function isOvertime(startedAt: string, expectedDurationMin: number, nowMs: number): boolean {
  return (nowMs - new Date(startedAt).getTime()) / 1000 >= expectedDurationMin * 60;
}

export default function ActiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: urlId } = use(params);
  const router = useRouter();
  const { confirm, ConfirmDialog } = useConfirm();

  const [activeId, setActiveId] = useState(urlId);
  const [sessionMap, setSessionMap] = useState<Record<string, SessionData>>({});
  const [inProgressSessions, setInProgress] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [celebrationBadges, setCelebrationBadges] = useState<
    { name: string; icon: string; description?: string }[]
  >([]);
  const [restTimerOpen, setRestTimerOpen] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const restTimer = useRestTimer(activeId);

  const session = sessionMap[activeId] ?? null;

  // ── Real-time: subscribe to active session channel ────────────────────────
  usePusherChannel(`session-${activeId}`, {
    SESSION_STARTED: (data) => {
      const payload = data as SessionStartedPayload;
      setSessionMap((prev) => {
        const cur = prev[activeId];
        if (!cur) return prev;
        return {
          ...prev,
          [activeId]: { ...cur, status: 'IN_PROGRESS', startedAt: payload.startedAt },
        };
      });
    },
    SESSION_ENDED: (data) => {
      const payload = data as SessionEndedPayload;
      toast.success(`Session ended — ${payload.actualDurationMin} min`);
      setSessionMap((prev) => {
        const cur = prev[activeId];
        if (!cur) return prev;
        return { ...prev, [activeId]: { ...cur, status: 'COMPLETED' } };
      });
    },
  });

  const fetchSession = useCallback(async (sid: string) => {
    const res = await fetch(`/api/trainer/sessions/${sid}`);
    return res.ok ? ((await res.json()).data as SessionData) : null;
  }, []);

  const fetchInProgress = useCallback(async () => {
    const res = await fetch(`/api/trainer/schedule?status=IN_PROGRESS`);
    if (!res.ok) return [];
    const { data } = await res.json();
    return data as SessionData[];
  }, []);

  // Initial load: fetch URL session, auto-start if SCHEDULED, then pre-fetch
  // every other in-progress session so tab switches are instant.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      const initial = await fetchSession(urlId);
      if (cancelled) return;
      if (!initial) {
        toast.error('Session not found');
        router.push('/trainer');
        return;
      }
      setSessionMap((prev) => ({ ...prev, [urlId]: initial }));
      setLoading(false);

      if (initial.status === 'SCHEDULED') {
        setStarting(true);
        try {
          const res = await fetch(`/api/trainer/sessions/${urlId}/start`, { method: 'POST' });
          if (cancelled) return;
          if (!res.ok) {
            const err = await res.json();
            toast.error(err.error || 'Failed to start session');
            return;
          }
          const refreshed = await fetchSession(urlId);
          if (cancelled) return;
          if (refreshed) setSessionMap((prev) => ({ ...prev, [urlId]: refreshed }));
        } finally {
          if (!cancelled) setStarting(false);
        }
      }

      const list = await fetchInProgress();
      if (cancelled) return;
      setInProgress(list);

      const others = await Promise.all(
        list.filter((s) => s.id !== urlId).map((s) => fetchSession(s.id)),
      );
      if (cancelled) return;
      setSessionMap((prev) => {
        const next = { ...prev };
        others.forEach((s) => {
          if (s) next[s.id] = s;
        });
        return next;
      });
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [urlId, fetchSession, fetchInProgress, router]);

  const switchTab = useCallback(
    async (newId: string) => {
      if (newId === activeId) return;
      if (hasUnsaved) {
        const ok = await confirm({
          title: 'Switch session?',
          description:
            'You have unsaved workout changes for the current client. They will be lost.',
          confirmText: 'Switch',
          variant: 'destructive',
        });
        if (!ok) return;
      }
      setActiveId(newId);
      setHasUnsaved(false);
      window.history.replaceState(null, '', `/trainer/session/${newId}`);
      // Refresh detail in the background so the workout log is up-to-date
      setSwitching(true);
      const fresh = await fetchSession(newId);
      if (fresh) setSessionMap((prev) => ({ ...prev, [newId]: fresh }));
      setSwitching(false);
    },
    [activeId, hasUnsaved, confirm, fetchSession],
  );

  async function handleEnd() {
    if (!session) return;
    const ok = await confirm({
      title: 'End Session',
      description: 'Are you sure you want to end this session?',
      confirmText: 'End Session',
      variant: 'destructive',
    });
    if (!ok) return;
    const endingId = session.id;
    setEnding(true);
    try {
      const res = await fetch(`/api/trainer/sessions/${endingId}/end`, { method: 'POST' });
      if (res.ok) {
        const body = await res.json();
        const newBadges: { name: string; icon: string; description?: string }[] =
          body?.data?.newBadges ?? [];
        if (newBadges.length > 0) {
          setCelebrationBadges(newBadges);
          await new Promise((r) => setTimeout(r, newBadges.length * 3500));
        }
        toast.success('Session ended');
        // If other sessions are still active, hop to the next one instead of
        // navigating back to the dashboard.
        const remaining = inProgressSessions.filter((s) => s.id !== endingId);
        if (remaining.length > 0 && remaining[0]) {
          const nextId = remaining[0].id;
          setInProgress(remaining);
          setSessionMap((prev) => {
            const next = { ...prev };
            delete next[endingId];
            return next;
          });
          setActiveId(nextId);
          setHasUnsaved(false);
          window.history.replaceState(null, '', `/trainer/session/${nextId}`);
          const fresh = await fetchSession(nextId);
          if (fresh) setSessionMap((prev) => ({ ...prev, [nextId]: fresh }));
        } else {
          router.push('/trainer');
        }
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to end session');
      }
    } finally {
      setEnding(false);
    }
  }

  const tabs = inProgressSessions.some((s) => s.id === activeId)
    ? inProgressSessions
    : session
      ? [session, ...inProgressSessions]
      : inProgressSessions;

  // Tick `now` every second so the elapsed timer in each tab card stays
  // accurate. Idle counters re-derive from the same value.
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  // Refresh in-progress session details every 30s so idle time reflects sets
  // logged in the active tab without requiring a tab switch.
  useEffect(() => {
    if (tabs.length <= 1) return;
    const ids = tabs.map((s) => s.id);
    const i = setInterval(async () => {
      const fresh = await Promise.all(ids.map((sid) => fetchSession(sid)));
      setSessionMap((prev) => {
        const next = { ...prev };
        fresh.forEach((s) => {
          if (s) next[s.id] = s;
        });
        return next;
      });
    }, 30_000);
    return () => clearInterval(i);
    // tabs is derived; key on the joined ids so we don't reset every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.map((s) => s.id).join(','), fetchSession]);

  // ── Loading / starting ──────────────────────────────────────────────────────
  if (loading || starting) {
    return (
      <div
        className="-m-4 md:-m-6 flex flex-col bg-background"
        style={{ height: 'calc(100dvh - 3.5rem - env(safe-area-inset-top))' }}
      >
        {/* ── Sticky tab card placeholder ── */}
        <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
          <div className="px-3 pt-2.5 pb-2.5">
            <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-purple-600/40 to-indigo-700/40 px-3.5 py-2.5">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/15" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-3 w-28 animate-pulse rounded bg-white/15" />
                <div className="h-5 w-24 animate-pulse rounded bg-white/15" />
              </div>
              <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-white/15" />
            </div>
          </div>
        </div>

        {/* ── Workout Logger body ── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {/* "WORKOUT LOG" label row + "+" button */}
          <div className="flex items-center justify-between">
            <div className="h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-8 w-8 animate-pulse rounded-xl bg-muted" />
          </div>

          {/* Empty-state card — mirrors the dashed card in WorkoutLogger */}
          <div className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border/40 bg-muted/20 px-6 py-12 text-center">
            {/* Icon box */}
            <div className="h-14 w-14 animate-pulse rounded-2xl bg-muted" />
            {/* Text lines */}
            <div className="space-y-2 w-full flex flex-col items-center">
              <div className="h-4 w-36 animate-pulse rounded-lg bg-muted" />
              <div className="h-3 w-52 animate-pulse rounded bg-muted" />
            </div>
            {/* "Add First Exercise" button */}
            <div className="h-10 w-40 animate-pulse rounded-xl bg-primary/20" />
          </div>
        </div>

        {/* ── End Session FAB ── */}
        <div
          className="shrink-0 px-4 pt-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <div className="h-14 w-full animate-pulse rounded-2xl bg-red-600/30" />
        </div>
      </div>
    );
  }

  if (!session) return null;

  const isActive = session.status === 'IN_PROGRESS' && !!session.startedAt;

  return (
    <div
      className="-m-4 md:-m-6 flex flex-col bg-background"
      style={{ height: 'calc(100dvh - 3.5rem - env(safe-area-inset-top))' }}
    >
      {/* ── Badge celebration overlay ── */}
      {celebrationBadges.length > 0 && (
        <BadgeCelebration badges={celebrationBadges} onDone={() => setCelebrationBadges([])} />
      )}

      {/* ── Sticky tab strip — active client owns a prominent hero card with
          progress ring; remaining sessions sit beneath in an "Others in Session"
          card showing idle time, so the trainer can spot a stalled client at a
          glance without leaving the active client's workout log. */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        {(() => {
          const activeTab = tabs.find((s) => s.id === activeId) ?? tabs[0];
          const otherTabs = tabs.filter((s) => s.id !== activeId);
          if (!activeTab) return null;

          const renderHero = () => {
            const s = activeTab;
            const detailed = sessionMap[s.id] ?? s;
            const name = `${s.client.user.firstName} ${s.client.user.lastName}`;
            const init = initials(s.client.user.firstName, s.client.user.lastName);
            const startedAt = detailed.startedAt ?? s.startedAt;
            const expectedMin = detailed.durationMin ?? s.durationMin;
            const elapsedSec = startedAt
              ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
              : 0;
            const expectedSec = Math.max(1, expectedMin * 60);
            const progress = Math.min(1, elapsedSec / expectedSec);
            const overtime = startedAt != null ? isOvertime(startedAt, expectedMin, now) : false;
            const r = 26;
            const circumference = 2 * Math.PI * r;
            const ringStroke = overtime ? '#fb7185' : '#c4b5fd';
            return (
              <div
                role="tab"
                aria-selected
                aria-label={`${name}, active session`}
                className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-700 px-3.5 py-2.5 text-white shadow-lg shadow-purple-900/20"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold ring-1 ring-white/20">
                    {init}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-sm font-semibold leading-tight">{name}</p>
                      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-purple-100/70">
                        Session
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-end gap-2">
                      {startedAt && (
                        <span
                          className={`font-mono text-xl font-black tabular-nums leading-none ${overtime ? 'text-rose-100' : 'text-white'}`}
                        >
                          {formatElapsed(startedAt, now)}
                        </span>
                      )}
                      <span className="flex items-center gap-1 pb-0.5">
                        <span className="relative flex h-1.5 w-1.5 items-center justify-center">
                          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75 animate-ping" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-100">Live</span>
                      </span>
                    </div>
                  </div>
                  <div className="relative h-11 w-11 shrink-0">
                    <svg className="h-full w-full -rotate-90" viewBox="0 0 60 60">
                      <circle
                        cx="30"
                        cy="30"
                        r={r}
                        fill="none"
                        stroke="rgba(255,255,255,0.18)"
                        strokeWidth="4"
                      />
                      <circle
                        cx="30"
                        cy="30"
                        r={r}
                        fill="none"
                        stroke={ringStroke}
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference * (1 - progress)}
                        className="transition-[stroke-dashoffset] duration-500"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            );
          };

          const renderOthersChip = (s: SessionData) => {
            const detailed = sessionMap[s.id] ?? s;
            const name = `${s.client.user.firstName} ${s.client.user.lastName}`;
            const init = initials(s.client.user.firstName, s.client.user.lastName);
            const lastActivity = lastActivityMs(detailed);
            const idleMs = lastActivity != null ? Math.max(0, now - lastActivity) : null;
            const idleSec = idleMs != null ? Math.floor(idleMs / 1000) : null;
            // Soft thresholds: warn at 8m, urgent at 20m. Don't escalate just
            // because trainer is focused elsewhere.
            const warn = idleSec != null && idleSec >= 480 && idleSec < 1200;
            const urgent = idleSec != null && idleSec >= 1200;
            const showIdle = idleMs != null && idleSec != null && idleSec >= 60;

            const avatarTone = urgent
              ? 'bg-red-500/20 text-red-400'
              : warn
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-primary/15 text-primary';
            const dotTone = urgent
              ? 'bg-red-500'
              : warn
                ? 'bg-amber-500'
                : 'bg-muted-foreground/40';
            const idleColor = urgent
              ? 'text-red-400'
              : warn
                ? 'text-amber-400'
                : 'text-muted-foreground';
            const idleText = showIdle ? `${formatIdle(idleMs!)} idle` : 'Resting';

            return (
              <button
                key={s.id}
                role="tab"
                aria-selected={false}
                aria-label={`Switch to ${name}, ${idleText}`}
                onClick={() => void switchTab(s.id)}
                disabled={ending || switching}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-muted/40 px-2 py-1.5 ring-1 ring-border/50 transition-colors hover:bg-muted/70 disabled:opacity-50"
              >
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarTone}`}
                >
                  {init}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[11px] font-semibold leading-tight text-foreground">
                      {name}
                    </p>
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotTone}`} />
                  </div>
                  <p className={`truncate text-[10px] tabular-nums leading-tight ${idleColor}`}>
                    {idleText}
                  </p>
                </div>
              </button>
            );
          };

          return (
            <div
              role="tablist"
              aria-label="Active sessions"
              className="px-3 pt-2.5 pb-2.5 space-y-2"
            >
              {renderHero()}
              {otherTabs.length > 0 && (
                <div className="flex gap-2 overflow-x-auto">{otherTabs.map(renderOthersChip)}</div>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Workout logger — page owns scroll, button stays pinned to bottom ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <WorkoutLogger
          key={session.id}
          sessionInstanceId={session.id}
          clientProfileId={session.client.id}
          clientName={`${session.client.user.firstName} ${session.client.user.lastName}`}
          existingLogs={session.workoutLogs}
          onUnsavedChange={setHasUnsaved}
          onRequestRest={isActive ? () => setRestTimerOpen(true) : undefined}
        />
      </div>

      {/* ── End Session footer — always visible at bottom, no fixed needed ── */}
      <div
        className="shrink-0 px-4 pt-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        {!restTimerOpen && (restTimer.isRunning || restTimer.isPaused || restTimer.isDone) && (
          <div className="mb-2">
            <RestTimerPill
              remaining={restTimer.remaining}
              isPaused={restTimer.isPaused}
              isDone={restTimer.isDone}
              onOpen={() => setRestTimerOpen(true)}
              onStop={restTimer.stop}
            />
          </div>
        )}
        <button
          onClick={handleEnd}
          disabled={ending}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 py-4 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/15 active:bg-red-500/20 disabled:opacity-50"
        >
          <Square className="h-4 w-4" />
          {ending ? 'Ending Session…' : 'End Session'}
        </button>
      </div>

      {/* Rest timer sheet */}
      {restTimerOpen && (
        <RestTimerSheet onClose={() => setRestTimerOpen(false)} timer={restTimer} />
      )}

      {ConfirmDialog}
    </div>
  );
}
