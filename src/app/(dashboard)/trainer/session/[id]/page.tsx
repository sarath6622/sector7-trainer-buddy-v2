'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Dumbbell, Square, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { InlineTimer } from '@/components/timer/SessionTimer';
import { WorkoutLogger } from '@/components/workout/WorkoutLogger';
import { BadgeCelebration } from '@/components/badges/BadgeCelebration';

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

function formatTime12(t: string) {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${m} ${ampm}`;
}

function toLocalDateStr(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-CA');
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
      <div className="-m-4 md:-m-6 flex h-full flex-col overflow-hidden bg-background">
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
  const displayDate = new Date(toLocalDateStr(session.scheduledDate)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div className="-m-4 md:-m-6 flex h-full flex-col overflow-hidden bg-background">
      {/* ── Badge celebration overlay ── */}
      {celebrationBadges.length > 0 && (
        <BadgeCelebration badges={celebrationBadges} onDone={() => setCelebrationBadges([])} />
      )}

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        {/* Top bar */}
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            onClick={() => router.push('/trainer')}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          {/* Client avatar + name */}
          <div className="flex flex-1 items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              {clientInit}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-none">{clientName}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {displayDate} · {formatTime12(session.scheduledTime)}
              </p>
            </div>
          </div>

          {/* Live timer */}
          {isActive && session.startedAt ? (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
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
            <Timer className="h-3 w-3" />
            {session.durationMin} min
          </div>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Dumbbell className="h-3 w-3" />
            {session.workoutLogs?.length ?? 0} exercise
            {(session.workoutLogs?.length ?? 0) !== 1 ? 's' : ''} logged
          </div>
          {isActive && (
            <>
              <div className="h-3 w-px bg-border" />
              <span className="text-[10px] font-semibold text-emerald-500">IN PROGRESS</span>
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
          />
        </div>
      </div>

      {/* ── Sticky footer ── */}
      <div className="sticky bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <button
          onClick={handleEnd}
          disabled={ending}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500/10 py-4 text-sm font-semibold text-red-500 ring-1 ring-red-500/20 transition-colors hover:bg-red-500/20 disabled:opacity-50"
        >
          <Square className="h-4 w-4" />
          {ending ? 'Ending Session…' : 'End Session'}
        </button>
      </div>

      {ConfirmDialog}
    </div>
  );
}
