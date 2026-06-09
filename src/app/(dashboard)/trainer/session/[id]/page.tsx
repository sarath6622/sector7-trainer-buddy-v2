'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { WorkoutLogger } from '@/components/workout/WorkoutLogger';
import { BadgeCelebration } from '@/components/badges/BadgeCelebration';
import { useRestTimer } from '@/hooks/useRestTimer';
import { useSessionPause } from '@/hooks/useSessionPause';
import { useRestAutofill } from '@/hooks/useRestAutofill';
import { usePusherChannel } from '@/hooks/usePusherChannel';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import type {
  SessionStartedPayload,
  SessionEndedPayload,
  WorkoutUpdatedPayload,
} from '@/lib/pusher';
import { RestTimerPillInline, RestTimerSheet } from '@/components/session/RestTimerUI';
import { SessionHero, initials, lastActivityMsOf } from '@/components/session/SessionHero';

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
      restSec: number | null;
      notes: string | null;
      createdAt?: string;
    }[];
  }[];
}

// `initials` + `lastActivityMsOf` live in @/components/session/SessionHero;
// imported above and reused by both pages.

function formatIdle(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${hr}h` : `${hr}h${rem}m`;
}

function formatRestRemaining(sec: number | null): string {
  if (sec === null || sec < 0) return '00:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Inactive-tab chip ─────────────────────────────────────────────────────────
// Lives in its own component so each instance can subscribe to its session's
// rest-timer via the per-id hook. The hook is muted (`silent: true`) so a
// peer's rest expiring doesn't buzz the trainer's phone — that cross-session
// alert is intentionally deferred. Visual states layered on top of the
// existing idle/warn/urgent escalation:
//   • running rest  → blue "Resting · MM:SS"
//   • paused rest   → amber "Rest paused"
//   • finished rest → emerald "Rest done!" + ping (highest priority alert,
//                     trainer probably needs to switch back)
//   • else          → existing idle/active behavior
function OthersChip({
  session: s,
  detailed,
  now,
  disabled,
  onSelect,
}: {
  session: SessionData;
  detailed: SessionData;
  now: number;
  disabled: boolean;
  onSelect: () => void;
}) {
  const rest = useRestTimer(s.id, { silent: true });
  const name = `${s.client.user.firstName} ${s.client.user.lastName}`;
  const init = initials(s.client.user.firstName, s.client.user.lastName);
  const lastActivity = lastActivityMsOf(detailed);
  const idleMs = lastActivity != null ? Math.max(0, now - lastActivity) : null;
  const idleSec = idleMs != null ? Math.floor(idleMs / 1000) : null;
  const warn = idleSec != null && idleSec >= 480 && idleSec < 1200;
  const urgent = idleSec != null && idleSec >= 1200;
  const showIdle = idleMs != null && idleSec != null && idleSec >= 60;

  // How long has the rest timer been done? Used to escalate the "Rest done"
  // state — fresh for the first 2 min (trainer just needs to come back),
  // amber after 2 min (needs attention), red after 5 min (urgent — client
  // has been waiting unattended). The thresholds are tighter than activity-
  // idle thresholds because the rest timer hitting zero is an explicit
  // "ready for the next set" signal.
  const restDoneSec =
    rest.isDone && rest.endTime != null ? Math.max(0, Math.floor((now - rest.endTime) / 1000)) : 0;
  const restDoneWarn = rest.isDone && restDoneSec >= 120 && restDoneSec < 300;
  const restDoneUrgent = rest.isDone && restDoneSec >= 300;
  const restDoneFresh = rest.isDone && restDoneSec < 120;

  // Rest state takes priority over the activity-idle counter. A client mid-
  // rest isn't idle in the trainer's mental model — they're on the clock.
  type Mode =
    | 'rest-running'
    | 'rest-paused'
    | 'rest-done-fresh'
    | 'rest-done-warn'
    | 'rest-done-urgent'
    | 'idle';
  const mode: Mode = restDoneUrgent
    ? 'rest-done-urgent'
    : restDoneWarn
      ? 'rest-done-warn'
      : restDoneFresh
        ? 'rest-done-fresh'
        : rest.isRunning
          ? 'rest-running'
          : rest.isPaused
            ? 'rest-paused'
            : 'idle';

  const avatarTone =
    mode === 'rest-done-fresh'
      ? 'bg-emerald-500/20 text-emerald-400'
      : mode === 'rest-done-warn'
        ? 'bg-amber-500/20 text-amber-400'
        : mode === 'rest-done-urgent'
          ? 'bg-red-500/20 text-red-400'
          : mode === 'rest-running'
            ? 'bg-blue-500/15 text-blue-400'
            : mode === 'rest-paused'
              ? 'bg-amber-500/20 text-amber-400'
              : urgent
                ? 'bg-red-500/20 text-red-400'
                : warn
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-primary/15 text-primary';

  const dotTone =
    mode === 'rest-done-fresh'
      ? 'bg-emerald-500'
      : mode === 'rest-done-warn'
        ? 'bg-amber-500'
        : mode === 'rest-done-urgent'
          ? 'bg-red-500'
          : mode === 'rest-running'
            ? 'bg-blue-500'
            : mode === 'rest-paused'
              ? 'bg-amber-500'
              : urgent
                ? 'bg-red-500'
                : warn
                  ? 'bg-amber-500'
                  : 'bg-muted-foreground/40';

  const subColor =
    mode === 'rest-done-fresh'
      ? 'text-emerald-400'
      : mode === 'rest-done-warn'
        ? 'text-amber-400'
        : mode === 'rest-done-urgent'
          ? 'text-red-400'
          : mode === 'rest-running'
            ? 'text-blue-400'
            : mode === 'rest-paused'
              ? 'text-amber-400'
              : urgent
                ? 'text-red-400'
                : warn
                  ? 'text-amber-400'
                  : 'text-muted-foreground';

  // Ring + chip-pulse: rest-done escalates as the wait grows. Fresh = calm
  // emerald ping, warn/urgent ping in their respective tones. Running/
  // paused rest is calm (just colored, no animation).
  const ringTone =
    mode === 'rest-done-fresh'
      ? 'ring-emerald-500/50'
      : mode === 'rest-done-warn'
        ? 'ring-amber-500/40'
        : mode === 'rest-done-urgent'
          ? 'ring-red-500/50'
          : mode === 'rest-running'
            ? 'ring-blue-500/30'
            : mode === 'rest-paused'
              ? 'ring-amber-500/30'
              : urgent
                ? 'ring-red-500/40'
                : warn
                  ? 'ring-amber-500/30'
                  : 'ring-border/50';

  const pulseTone =
    mode === 'rest-done-fresh'
      ? 'bg-emerald-500'
      : mode === 'rest-done-warn'
        ? 'bg-amber-500'
        : mode === 'rest-done-urgent' || urgent
          ? 'bg-red-500'
          : warn
            ? 'bg-amber-500'
            : null;

  // Chip-level pulse only at the strongest urgency states.
  const chipPulse = mode === 'rest-done-urgent' || urgent;

  let subText: string;
  if (mode === 'rest-running') subText = `Resting · ${formatRestRemaining(rest.remaining)}`;
  else if (mode === 'rest-paused') subText = `Rest paused · ${formatRestRemaining(rest.remaining)}`;
  else if (mode === 'rest-done-fresh') subText = 'Rest done!';
  else if (mode === 'rest-done-warn' || mode === 'rest-done-urgent')
    subText = `Rest done · ${formatIdle(restDoneSec * 1000)}`;
  else if (showIdle) subText = `${formatIdle(idleMs!)} idle`;
  else subText = 'Active';

  return (
    <button
      key={s.id}
      role="tab"
      aria-selected={false}
      aria-label={`Switch to ${name}, ${subText}`}
      onClick={onSelect}
      disabled={disabled}
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-muted/40 px-2 py-1.5 ring-1 transition-colors hover:bg-muted/70 disabled:opacity-50 ${ringTone} ${
        chipPulse ? 'animate-pulse' : ''
      }`}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${avatarTone}`}
      >
        {init}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[11px] font-semibold leading-tight text-foreground">{name}</p>
          <span className="relative flex h-1.5 w-1.5 shrink-0 items-center justify-center">
            {pulseTone && (
              <span
                className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${pulseTone}`}
              />
            )}
            <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotTone}`} />
          </span>
        </div>
        <p className={`truncate text-[10px] tabular-nums leading-tight ${subColor}`}>{subText}</p>
      </div>
    </button>
  );
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
  const [defaultDurationMin, setDefaultDurationMin] = useState<number | null>(null);
  const restTimer = useRestTimer(activeId);
  const sessionPause = useSessionPause(activeId);
  const { lastFinishedRestSec, consumeRest } = useRestAutofill(activeId, restTimer);
  // Keyboard-aware container height. iOS standalone PWAs don't shrink `dvh`
  // when the virtual keyboard opens, so without this the bottom rest-timer
  // pill ends up hidden behind the keyboard while the trainer types.
  const keyboardInset = useKeyboardInset();
  const containerHeight = `calc(100dvh - 3.5rem - env(safe-area-inset-top) - ${keyboardInset}px)`;

  // Branch default session duration drives the hero progress ring so the ring
  // reflects the gym's standard slot length rather than an out-of-band per-row
  // override (which can be stale on long-lived/carry-over sessions).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch('/api/trainer/settings');
      if (!res.ok || cancelled) return;
      const { data } = await res.json();
      if (!cancelled && typeof data?.defaultSessionDurationMin === 'number') {
        setDefaultDurationMin(data.defaultSessionDurationMin);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const session = sessionMap[activeId] ?? null;
  const { data: authSession } = useSession();
  const currentUserId = authSession?.user?.id;

  const fetchSession = useCallback(async (sid: string) => {
    const res = await fetch(`/api/trainer/sessions/${sid}`);
    return res.ok ? ((await res.json()).data as SessionData) : null;
  }, []);

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
    // Peer (client) saved workout edits — refetch so the trainer sees them
    // live instead of waiting on the 30s poll. Skip our own echo so a save
    // from this device doesn't trigger a redundant round-trip. WorkoutLogger
    // drops the rehydration if the trainer has unsaved local edits.
    WORKOUT_UPDATED: (data) => {
      const payload = data as WorkoutUpdatedPayload;
      if (payload.actorUserId === currentUserId) return;
      void (async () => {
        const refreshed = await fetchSession(activeId);
        if (refreshed) setSessionMap((prev) => ({ ...prev, [activeId]: refreshed }));
      })();
    },
  });

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
      <div className="-m-4 md:-m-6 flex flex-col bg-background" style={{ height: containerHeight }}>
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
      </div>
    );
  }

  if (!session) return null;

  const isActive = session.status === 'IN_PROGRESS' && !!session.startedAt;

  return (
    <div className="-m-4 md:-m-6 flex flex-col bg-background" style={{ height: containerHeight }}>
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

          const s = activeTab;
          const detailed = sessionMap[s.id] ?? s;
          const heroName = `${s.client.user.firstName} ${s.client.user.lastName}`;
          const heroInitials = initials(s.client.user.firstName, s.client.user.lastName);
          const expectedMin = defaultDurationMin ?? detailed.durationMin ?? s.durationMin;

          return (
            <div role="tablist" aria-label="Active sessions" className="px-3 pb-2.5 space-y-2">
              <SessionHero
                name={heroName}
                initials={heroInitials}
                startedAt={detailed.startedAt ?? s.startedAt ?? null}
                expectedDurationMin={expectedMin}
                pausedAt={sessionPause.pausedAt}
                accumulatedPausedSec={sessionPause.accumulatedPausedSec}
                isPaused={sessionPause.isPaused}
                onTogglePause={() => void sessionPause.toggle()}
                restTimer={{
                  isDone: restTimer.isDone,
                  isRunning: restTimer.isRunning,
                  isPaused: restTimer.isPaused,
                  endTime: restTimer.endTime,
                  remaining: restTimer.remaining,
                }}
                lastActivityMs={lastActivityMsOf(detailed)}
                now={now}
                onEnd={handleEnd}
                ending={ending}
              />
              {otherTabs.length > 0 && (
                // -my-1 py-1 / -mx-1 px-1: when overflow-x is auto, browsers
                // also clip the y-axis, which chops the chips' colored rings
                // and ping halos at the top/bottom edges. The negative margin
                // + matching inner padding gives the rings breathing room
                // without changing the visual spacing of the surrounding row.
                <div className="-mx-1 -my-1 flex gap-2 overflow-x-auto px-1 py-1">
                  {otherTabs.map((s) => (
                    <OthersChip
                      key={s.id}
                      session={s}
                      detailed={sessionMap[s.id] ?? s}
                      now={now}
                      disabled={ending || switching}
                      onSelect={() => void switchTab(s.id)}
                    />
                  ))}
                </div>
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
          onForeground={() => {
            // Phone unlocked / tab refocused — pull fresh server state so the
            // log isn't showing stale data after a long background.
            void (async () => {
              const refreshed = await fetchSession(session.id);
              if (refreshed) setSessionMap((prev) => ({ ...prev, [session.id]: refreshed }));
            })();
          }}
          onRequestRest={isActive ? () => setRestTimerOpen(true) : undefined}
          lastFinishedRestSec={lastFinishedRestSec}
          onConsumeRest={consumeRest}
          restTimerRemaining={restTimer.remaining}
          restTimerPaused={restTimer.isPaused}
        />
      </div>

      {/* ── Bottom dock — only the rest-timer pill lives here now. The End
          Session button moved into the hero to claim back the vertical
          space; the dock collapses to nothing when no rest is active. ── */}
      {!restTimerOpen && (restTimer.isRunning || restTimer.isPaused || restTimer.isDone) && (
        <div
          className="shrink-0 px-4 pt-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <RestTimerPillInline
            remaining={restTimer.remaining}
            isPaused={restTimer.isPaused}
            isDone={restTimer.isDone}
            onOpen={() => setRestTimerOpen(true)}
            onStop={restTimer.stop}
          />
        </div>
      )}

      {/* Rest timer sheet */}
      {restTimerOpen && (
        <RestTimerSheet onClose={() => setRestTimerOpen(false)} timer={restTimer} />
      )}

      {ConfirmDialog}
    </div>
  );
}
