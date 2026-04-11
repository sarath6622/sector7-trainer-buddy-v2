'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Dumbbell, Square, Timer, BedDouble, Pause, Play, X } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { InlineTimer } from '@/components/timer/SessionTimer';
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
    }[];
  }[];
}

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

export default function ActiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { confirm, ConfirmDialog } = useConfirm();

  const [session, setSession] = useState<SessionData | null>(null);
  const [inProgressSessions, setInProgress] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [ending, setEnding] = useState(false);
  const [celebrationBadges, setCelebrationBadges] = useState<
    { name: string; icon: string; description?: string }[]
  >([]);
  const [restTimerOpen, setRestTimerOpen] = useState(false);
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const restTimer = useRestTimer(id);

  // ── Real-time: subscribe to session channel ───────────────────────────────
  usePusherChannel(`session-${id}`, {
    SESSION_STARTED: (data) => {
      const payload = data as SessionStartedPayload;
      setSession((prev) =>
        prev ? { ...prev, status: 'IN_PROGRESS', startedAt: payload.startedAt } : prev,
      );
    },
    SESSION_ENDED: (data) => {
      const payload = data as SessionEndedPayload;
      toast.success(`Session ended — ${payload.actualDurationMin} min`);
      setSession((prev) => (prev ? { ...prev, status: 'COMPLETED' } : prev));
    },
  });

  const fetchSession = useCallback(async (sid: string) => {
    const res = await fetch(`/api/trainer/sessions/${sid}`);
    return res.ok ? ((await res.json()).data as SessionData) : null;
  }, []);

  const fetchInProgress = useCallback(async () => {
    const today = new Date().toLocaleDateString('en-CA');
    const res = await fetch(`/api/trainer/schedule?date=${today}`);
    if (!res.ok) return [];
    const { data } = await res.json();
    return (data as SessionData[]).filter((s) => s.status === 'IN_PROGRESS');
  }, []);

  const autoStart = useCallback(
    async (sessionId: string) => {
      setStarting(true);
      try {
        const res = await fetch(`/api/trainer/sessions/${sessionId}/start`, { method: 'POST' });
        if (res.ok) {
          const { data } = await res.json();
          setSession(data.session);
          setInProgress(await fetchInProgress());
        } else {
          const err = await res.json();
          toast.error(err.error || 'Failed to start session');
        }
      } finally {
        setStarting(false);
      }
    },
    [fetchInProgress],
  );

  useEffect(() => {
    async function init() {
      setLoading(true);
      const [sess, active] = await Promise.all([fetchSession(id), fetchInProgress()]);
      if (!sess) {
        toast.error('Session not found');
        router.push('/trainer');
        return;
      }
      setSession(sess);
      setInProgress(active);
      setLoading(false);
      if (sess.status === 'SCHEDULED') await autoStart(id);
    }
    void init();
  }, [id, fetchSession, fetchInProgress, autoStart, router]);

  async function handleEnd() {
    if (!session) return;
    const ok = await confirm({
      title: 'End Session',
      description: 'Are you sure you want to end this session?',
      confirmText: 'End Session',
      variant: 'destructive',
    });
    if (!ok) return;
    setEnding(true);
    try {
      const res = await fetch(`/api/trainer/sessions/${session.id}/end`, { method: 'POST' });
      if (res.ok) {
        const body = await res.json();
        const newBadges: { name: string; icon: string; description?: string }[] =
          body?.data?.newBadges ?? [];
        if (newBadges.length > 0) {
          setCelebrationBadges(newBadges);
          // Delay navigation so the celebration plays
          await new Promise((r) => setTimeout(r, newBadges.length * 3500));
        }
        toast.success('Session ended');
        router.push('/trainer');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to end session');
      }
    } finally {
      setEnding(false);
    }
  }

  const tabs = inProgressSessions.some((s) => s.id === id)
    ? inProgressSessions
    : session
      ? [session, ...inProgressSessions]
      : inProgressSessions;

  // ── Loading / starting ──────────────────────────────────────────────────────
  if (loading || starting) {
    return (
      <div
        className="-mx-4 md:-mx-6 -mt-4 md:-mt-6 flex h-full flex-col overflow-hidden bg-background"
        style={{ marginBottom: 'calc(-1.5rem - env(safe-area-inset-bottom))' }}
      >
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <div className="h-8 w-8 animate-pulse rounded-xl bg-muted" />
          <div className="h-4 w-36 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {starting ? 'Starting session…' : 'Loading…'}
          </p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const clientName = `${session.client.user.firstName} ${session.client.user.lastName}`;
  const clientInit = initials(session.client.user.firstName, session.client.user.lastName);
  const isActive = session.status === 'IN_PROGRESS' && !!session.startedAt;

  return (
    <div
      className="-mx-4 md:-mx-6 -mt-4 md:-mt-6 flex h-full flex-col overflow-hidden bg-background"
      style={{ marginBottom: 'calc(-1.5rem - env(safe-area-inset-bottom))' }}
    >
      {/* ── Badge celebration overlay ── */}
      {celebrationBadges.length > 0 && (
        <BadgeCelebration badges={celebrationBadges} onDone={() => setCelebrationBadges([])} />
      )}

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        {/* Top bar */}
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            onClick={async () => {
              if (isActive && hasUnsaved) {
                const ok = await confirm({
                  title: 'Leave session?',
                  description: 'You have unsaved workout changes. They will be lost if you leave.',
                  confirmText: 'Leave',
                  variant: 'destructive',
                });
                if (!ok) return;
              }
              router.push('/trainer');
            }}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* Client avatar only */}
          <div className="flex flex-1 items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              {clientInit}
            </div>
            <p className="truncate text-sm font-semibold">{clientName}</p>
          </div>

          {/* Live timer */}
          {isActive && session.startedAt ? (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5">
              <Timer className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span className="font-mono text-sm font-bold tabular-nums text-emerald-500">
                <InlineTimer
                  startedAt={session.startedAt}
                  expectedDurationMin={session.durationMin}
                />
              </span>
            </div>
          ) : (
            <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-semibold text-muted-foreground">
              {session.status.replace('_', ' ')}
            </span>
          )}
        </div>

        {/* Session meta chips */}
        <div className="flex items-center gap-3 px-4 pb-2.5">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Dumbbell className="h-3 w-3" />
            {session.workoutLogs?.length ?? 0} exercise
            {(session.workoutLogs?.length ?? 0) !== 1 ? 's' : ''} logged
          </div>
          {isActive && (
            <>
              <div className="h-3 w-px bg-border" />
              <span className="text-[10px] font-semibold text-emerald-500">IN PROGRESS</span>
              <div className="h-3 w-px bg-border" />
              <button
                onClick={() => setRestTimerOpen(true)}
                className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
              >
                <BedDouble className="h-3 w-3" />
                Rest
              </button>
            </>
          )}
        </div>

        {/* Client tab bar (multi-session) */}
        {tabs.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-2 no-scrollbar">
            {tabs.map((s) => {
              const name = `${s.client.user.firstName} ${s.client.user.lastName}`;
              const selected = s.id === id;
              return (
                <button
                  key={s.id}
                  onClick={() => router.push(`/trainer/session/${s.id}`)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selected
                      ? 'bg-emerald-500 text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Workout logger (scrollable) ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 pb-32">
          <WorkoutLogger
            sessionInstanceId={session.id}
            clientProfileId={session.client.id}
            existingLogs={session.workoutLogs}
            onUnsavedChange={setHasUnsaved}
          />
        </div>
      </div>

      {/* ── Sticky footer ── */}
      <div className="sticky bottom-0 z-20 border-t bg-background/95 px-4 pt-2 pb-safe backdrop-blur">
        {!restTimerOpen && (restTimer.isRunning || restTimer.isPaused || restTimer.isDone) && (
          <RestTimerPill
            remaining={restTimer.remaining}
            isPaused={restTimer.isPaused}
            isDone={restTimer.isDone}
            onOpen={() => setRestTimerOpen(true)}
            onStop={restTimer.stop}
          />
        )}
        <button
          onClick={handleEnd}
          disabled={ending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white shadow-lg shadow-red-900/40 transition-colors hover:bg-red-700 disabled:opacity-50"
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
