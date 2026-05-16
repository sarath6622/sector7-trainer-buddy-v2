'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRestTimer } from '@/hooks/useRestTimer';
import { useSessionPause } from '@/hooks/useSessionPause';
import { useRestAutofill } from '@/hooks/useRestAutofill';
import { useRouter } from 'next/navigation';
import { Clock, TrendingUp, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { WorkoutLogger } from '@/components/workout/WorkoutLogger';
import { RestTimerPillFloating, RestTimerSheet } from '@/components/session/RestTimerUI';
import { SessionHero, initials, lastActivityMsOf } from '@/components/session/SessionHero';

type ExerciseType = 'WEIGHTED' | 'BODYWEIGHT' | 'DURATION' | 'CARDIO';

interface SetData {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  rpe: number | null;
  restSec: number | null;
  notes: string | null;
  // Surfaced by the API even without an explicit `select` — used by the
  // SessionHero idle escalation. Optional because legacy rows may lack it.
  createdAt?: string;
}

interface WorkoutLog {
  id: string;
  exerciseId: string;
  orderIndex: number;
  // Same — drives idle escalation in the hero.
  updatedAt?: string;
  exercise: {
    id: string;
    name: string;
    targetMuscleGroup: string;
    category: string;
    exerciseType: ExerciseType;
  };
  sets: SetData[];
}

interface SessionData {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  status: string;
  startedAt?: string;
  client?: { id: string; user: { firstName: string; lastName: string } };
  trainer: { user: { firstName: string; lastName: string } };
  workoutLogs: WorkoutLog[];
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

export default function ClientSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [progressModal, setProgressModal] = useState<{
    exerciseId: string;
    exerciseName: string;
    unit: string;
  } | null>(null);
  const [restTimerOpen, setRestTimerOpen] = useState(false);
  // Tracks whether the logger has pending unsaved edits (currently used only
  // to decide whether to forcefully refresh from server — when there are
  // unsaved local edits, server polling could clobber them).
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const restTimer = useRestTimer(id);
  const sessionPause = useSessionPause(id);
  const { lastFinishedRestSec, consumeRest } = useRestAutofill(id, restTimer);

  // 1Hz tick — mirrors the trainer page so SessionHero can re-derive elapsed
  // time, idle escalation, and rest-done staleness once a second. Declared
  // up here (above the early returns) so hooks fire in a stable order.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const fetchSession = useCallback(async () => {
    const res = await fetch(`/api/client/sessions/${id}`);
    if (res.ok) {
      const { data } = await res.json();
      setSession(data as SessionData);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSession().finally(() => setLoading(false));
  }, [fetchSession]);

  // Poll every 10s while session is IN_PROGRESS so the client picks up edits
  // made on the trainer's device. Pauses polling when the client has local
  // unsaved edits — otherwise a server refresh would overwrite them mid-type.
  useEffect(() => {
    if (!session || session.status !== 'IN_PROGRESS') return;
    if (hasUnsaved) return;
    const interval = setInterval(() => void fetchSession(), 10_000);
    return () => clearInterval(interval);
  }, [session, fetchSession, hasUnsaved]);

  if (loading) {
    return (
      <div className="-m-4 md:-m-6 flex h-full flex-col overflow-hidden bg-background">
        <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
          <div className="flex h-12 items-center gap-3 px-4">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">Session not found</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/client')}>
          Go back
        </Button>
      </div>
    );
  }

  const trainerFirst = session.trainer.user.firstName;
  const trainerLast = session.trainer.user.lastName;
  const trainerName = `${trainerFirst} ${trainerLast}`;
  const trainerInitials = initials(trainerFirst, trainerLast);
  const isActive = session.status === 'IN_PROGRESS' && !!session.startedAt;
  const isScheduled = session.status === 'SCHEDULED';

  // Idle escalation anchors to the latest of: startedAt, any log's updatedAt,
  // any set's createdAt. Without this, the hero would show "1H idle" even
  // moments after the user logged a set (anchored only on startedAt).
  const lastActivityMs = lastActivityMsOf(session);

  return (
    <div
      className="-m-4 md:-m-6 flex flex-col bg-background"
      style={{ height: 'calc(100dvh - 3.5rem - env(safe-area-inset-top))' }}
    >
      {/* ── Sticky hero card ── */}
      {/* No back button here — exit paths live in the global top nav
          (hamburger menu + logo), which matches the trainer session page's
          chrome-free shell. Less competing UI; the hero gets the focus. */}
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        {/* Hero only renders once the trainer has started the session. For
            SCHEDULED, the body below shows a "Waiting for trainer to start"
            empty state instead — there's no elapsed timer to anchor a hero. */}
        {!isScheduled && (
          <div className="px-3 py-2.5">
            <SessionHero
              // Client-side: the hero subject is the trainer ("With X").
              // The avatar initials match so the visual identity stays
              // consistent with the client dashboard's "Next session with X"
              // surface.
              name={`With ${trainerName}`}
              initials={trainerInitials}
              startedAt={session.startedAt ?? null}
              expectedDurationMin={session.durationMin}
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
              lastActivityMs={lastActivityMs}
              now={now}
              // No `onEnd` — start/end remain trainer-only (ADR-036). The
              // client gets the Pause button only.
            />
          </div>
        )}
      </div>

      {/* ── Body ── */}
      {isScheduled ? (
        // Session not started yet — start/end remain trainer-only (ADR-036).
        // Clients see a waiting state, not the logger.
        <div className="flex-1 overflow-y-auto px-4 py-12">
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 px-6 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Waiting for trainer to start</p>
            {/* Scheduled time is shown here (rather than in the top strip)
                because this is the one screen state where the user actually
                needs to know "when is this supposed to happen." */}
            <p className="text-sm font-semibold tabular-nums text-foreground">
              {new Date(toLocalDateStr(session.scheduledDate)).toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
              })}{' '}
              · {formatTime12(session.scheduledTime)} · {session.durationMin} min with {trainerName}
            </p>
            <p className="text-xs text-muted-foreground">
              Once your trainer starts the session, you and they can both log exercises here in real
              time.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <WorkoutLogger
            key={session.id}
            sessionInstanceId={session.id}
            // Client-scoped exercise progress modal opens inside the logger
            // (ADR-017 — passing clientProfileId enables the per-exercise
            // trend button). The client's own id may not be on the payload,
            // but the WorkoutLogger handles `undefined` by hiding the button.
            clientProfileId={session.client?.id}
            existingLogs={session.workoutLogs}
            onUnsavedChange={setHasUnsaved}
            onRequestRest={isActive ? () => setRestTimerOpen(true) : undefined}
            lastFinishedRestSec={lastFinishedRestSec}
            onConsumeRest={consumeRest}
            restTimerRemaining={restTimer.remaining}
            restTimerPaused={restTimer.isPaused}
          />
        </div>
      )}

      {/* Rest timer — floating pill when sheet is closed */}
      {!restTimerOpen && (restTimer.isRunning || restTimer.isPaused || restTimer.isDone) && (
        <RestTimerPillFloating
          remaining={restTimer.remaining}
          isPaused={restTimer.isPaused}
          isDone={restTimer.isDone}
          onOpen={() => setRestTimerOpen(true)}
          onStop={restTimer.stop}
        />
      )}

      {/* Rest timer sheet */}
      {restTimerOpen && (
        <RestTimerSheet onClose={() => setRestTimerOpen(false)} timer={restTimer} />
      )}

      {/* Exercise progress modal */}
      {progressModal && (
        <ClientExerciseProgressModal
          exerciseId={progressModal.exerciseId}
          exerciseName={progressModal.exerciseName}
          unit={progressModal.unit}
          onClose={() => setProgressModal(null)}
        />
      )}
    </div>
  );
}

// ─── Client-scoped exercise progress modal ────────────────────────────────────
// Kept on this page (rather than centralised) because it pulls from
// /api/client/progress/charts — a client-only endpoint. Trainer logger uses a
// different endpoint (/api/trainer/clients/[id]/exercise-progress) for the
// same chart shape (ADR-017).

interface ChartPoint {
  date: string;
  value: number | null;
}

function ClientExerciseProgressModal({
  exerciseId,
  exerciseName,
  unit,
  onClose,
}: {
  exerciseId: string;
  exerciseName: string;
  unit: string;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/client/progress/charts?metric=exercise&exerciseId=${exerciseId}`)
      .then((r) => r.json())
      .then(({ data: d }) => setRaw(d ?? []))
      .catch(() => setRaw([]))
      .finally(() => setLoading(false));
  }, [exerciseId]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const values = raw.map((p) => p.value).filter((v): v is number => v != null);
  const latest = values.at(-1) ?? null;
  const first = values[0] ?? null;
  const best = values.length ? Math.max(...values) : null;
  const delta = latest != null && first != null ? latest - first : null;

  const chartData = raw
    .filter((p) => p.value != null)
    .map((p) => ({
      date: new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
      value: p.value,
    }));

  const axisLabel =
    unit === 'kg'
      ? 'Max weight per session'
      : unit === 'sec'
        ? 'Duration per session'
        : 'Reps per session';

  const positive = delta != null && delta > 0;
  const negative = delta != null && delta < 0;
  const DeltaIcon =
    delta == null || Math.abs(delta) < 0.01 ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  const deltaColor =
    delta == null || Math.abs(delta ?? 0) < 0.01
      ? 'text-muted-foreground'
      : positive
        ? 'text-emerald-500'
        : 'text-red-500';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative z-10 w-full max-w-lg rounded-t-3xl bg-card pb-safe shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="flex items-start justify-between px-5 pt-3 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              My Progress
            </p>
            <h2 className="mt-0.5 text-lg font-bold">{exerciseName}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pb-10 pt-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <TrendingUp className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-medium">No history yet</p>
            <p className="text-sm text-muted-foreground">
              Progress will appear after sessions are logged
            </p>
          </div>
        ) : (
          <div className="space-y-4 px-5 pb-8">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-background p-3 ring-1 ring-border/40">
                <p className="text-[10px] text-muted-foreground">Latest</p>
                <p className="mt-1 text-lg font-bold leading-none">
                  {latest != null ? latest.toFixed(1) : '—'}
                  <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                    {latest != null ? unit : ''}
                  </span>
                </p>
              </div>
              <div className="rounded-2xl bg-background p-3 ring-1 ring-border/40">
                <p className="text-[10px] text-muted-foreground">Best</p>
                <p className="mt-1 text-lg font-bold leading-none text-amber-500">
                  {best != null ? best.toFixed(1) : '—'}
                  <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                    {best != null ? unit : ''}
                  </span>
                </p>
              </div>
              <div className="rounded-2xl bg-background p-3 ring-1 ring-border/40">
                <p className="text-[10px] text-muted-foreground">Change</p>
                <div
                  className={`mt-1 flex items-center gap-0.5 text-lg font-bold leading-none ${deltaColor}`}
                >
                  <DeltaIcon className="h-4 w-4" />
                  {delta != null && Math.abs(delta) >= 0.01
                    ? `${Math.abs(delta).toFixed(1)}${unit}`
                    : '—'}
                </div>
                <p className="mt-1 text-[9px] text-muted-foreground">
                  {values.length} session{values.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="rounded-2xl bg-background p-4 ring-1 ring-border/40">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {axisLabel}
              </p>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cpGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(255,255,255,0.08)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#888', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: '#888', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${v}${unit}`}
                    width={44}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-xl border border-border/60 bg-card px-3 py-2 text-xs shadow-lg">
                          <p className="text-muted-foreground">{label}</p>
                          <p className="mt-0.5 text-sm font-bold">
                            {(payload[0]?.value as number)?.toFixed(1)} {unit}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(217 91% 60%)"
                    strokeWidth={2.5}
                    fill="url(#cpGrad)"
                    dot={{ fill: 'hsl(217 91% 60%)', r: 4, strokeWidth: 0 }}
                    activeDot={{
                      r: 5,
                      fill: 'hsl(217 91% 60%)',
                      stroke: 'hsl(var(--background))',
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {values.length >= 2 && (
              <div
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm ${
                  positive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : negative
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-muted/50 text-muted-foreground'
                }`}
              >
                <DeltaIcon className="h-4 w-4 shrink-0" />
                <span>
                  {positive
                    ? `Up ${delta!.toFixed(1)}${unit} since your first session`
                    : negative
                      ? `Down ${Math.abs(delta!).toFixed(1)}${unit} since your first session`
                      : 'No change since your first session'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
