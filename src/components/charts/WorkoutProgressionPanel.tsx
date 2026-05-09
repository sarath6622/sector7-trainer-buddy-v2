'use client';

import { useState, useEffect, useRef } from 'react';
import {
  ChevronDown,
  Search,
  Dumbbell,
  ArrowUp,
  Trophy,
  LineChart as LineChartIcon,
  History as HistoryIcon,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProgressLineChart from './ProgressLineChart';

export interface ExerciseSummary {
  id: string;
  name: string;
  targetMuscleGroup: string;
  exerciseType: string;
  unit: string; // 'kg' | 'reps' | 'sec'
  sessionCount: number;
  currentMax: number;
  startMax: number;
  improvement: number;
}

interface ChartPoint {
  date: string;
  value: number | null;
  label?: string;
}

// ─── Searchable exercise combobox ─────────────────────────────────────────────

function ExerciseCombobox({
  exercises,
  selected,
  onSelect,
}: {
  exercises: ExerciseSummary[];
  selected: ExerciseSummary | null;
  onSelect: (ex: ExerciseSummary) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 10);
  }, [open]);

  const filtered = search
    ? exercises.filter(
        (ex) =>
          ex.name.toLowerCase().includes(search.toLowerCase()) ||
          ex.targetMuscleGroup.toLowerCase().includes(search.toLowerCase()),
      )
    : exercises;

  // Group by muscle
  const byMuscle = filtered.reduce<Record<string, ExerciseSummary[]>>((acc, ex) => {
    if (!acc[ex.targetMuscleGroup]) acc[ex.targetMuscleGroup] = [];
    acc[ex.targetMuscleGroup]!.push(ex);
    return acc;
  }, {});

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-full items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm shadow-sm transition-colors hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring/40"
      >
        <Dumbbell className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span
          className={`flex-1 text-left truncate ${selected ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          {selected ? selected.name : 'Select exercise…'}
        </span>
        {selected && (
          <span className="text-xs text-muted-foreground shrink-0">
            {selected.targetMuscleGroup}
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-full rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exercises…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* Options */}
          <div className="max-h-72 overflow-y-auto py-1">
            {Object.keys(byMuscle).length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                No exercises found
              </p>
            ) : (
              Object.entries(byMuscle).map(([muscle, exs]) => (
                <div key={muscle}>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {muscle}
                  </p>
                  {exs.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => {
                        onSelect(ex);
                        setOpen(false);
                        setSearch('');
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-accent ${
                        selected?.id === ex.id ? 'bg-accent/60 font-medium' : ''
                      }`}
                    >
                      <span>{ex.name}</span>
                      <span className="text-xs text-muted-foreground ml-4 shrink-0">
                        {ex.currentMax} {ex.unit} · {ex.sessionCount} sessions
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Single exercise chart ────────────────────────────────────────────────────

function ExerciseChart({
  exercise,
  chartEndpoint,
}: {
  exercise: ExerciseSummary;
  chartEndpoint: string;
}) {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    setData([]);
    fetch(`${chartEndpoint}?metric=exercise&exerciseId=${exercise.id}`)
      .then((r) => r.json())
      .then(({ data: d }) => setData(d ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [chartEndpoint, exercise.id]);

  const improved = exercise.improvement > 0;
  const u = exercise.unit;

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="text-base font-semibold">{exercise.name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {exercise.targetMuscleGroup} ·{' '}
              <span className="capitalize">{exercise.exerciseType.toLowerCase()}</span>
            </p>
          </div>
          <div className="flex gap-6">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Current best</p>
              <p className="text-2xl font-bold">
                {exercise.currentMax}{' '}
                <span className="text-sm font-normal text-muted-foreground">{u}</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Since start</p>
              <p className={`text-2xl font-bold ${improved ? 'text-emerald-500' : 'text-red-400'}`}>
                <span className="inline-flex items-center gap-0.5">
                  <ArrowUp className={`h-5 w-5 ${improved ? '' : 'rotate-180'}`} />
                  {improved ? '+' : ''}
                  {exercise.improvement} <span className="text-sm">{u}</span>
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Sessions</p>
              <p className="text-2xl font-bold">{exercise.sessionCount}</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-56 animate-pulse rounded-xl bg-muted" />
        ) : (
          <ProgressLineChart
            data={data}
            unit={u}
            color="hsl(217 91% 60%)"
            height={220}
            gradientId={`grad-ex-detail-${exercise.id}`}
          />
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Start: {exercise.startMax} {u} → Current: {exercise.currentMax} {u}
        </p>
      </CardContent>
    </Card>
  );
}

// ─── PR Summary table ─────────────────────────────────────────────────────────

function PRTable({
  exercises,
  selectedId,
  onSelect,
}: {
  exercises: ExerciseSummary[];
  selectedId: string | null;
  onSelect: (ex: ExerciseSummary) => void;
}) {
  return (
    <div className="rounded-xl ring-1 ring-border/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-muted/30 border-b border-border/50">
        <Trophy className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wide">All Exercise PRs</p>
      </div>
      <div className="divide-y divide-border/30">
        {exercises.map((ex) => {
          const improved = ex.improvement > 0;
          const neutral = ex.improvement === 0;
          return (
            <button
              key={ex.id}
              type="button"
              onClick={() => onSelect(ex)}
              className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30 ${
                selectedId === ex.id ? 'bg-primary/5' : ''
              }`}
            >
              {/* Left: name + muscle */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{ex.name}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{ex.targetMuscleGroup}</p>
              </div>

              {/* Right: best + improvement */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Best</p>
                  <p className="text-sm font-semibold">
                    {ex.currentMax} {ex.unit}
                  </p>
                </div>
                <div className="text-right w-16">
                  <p className="text-xs text-muted-foreground">Change</p>
                  <p
                    className={`text-sm font-semibold ${
                      neutral
                        ? 'text-muted-foreground'
                        : improved
                          ? 'text-emerald-500'
                          : 'text-red-400'
                    }`}
                  >
                    {improved ? '+' : ''}
                    {ex.improvement} {ex.unit}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Workout History tab ──────────────────────────────────────────────────────

interface HistorySet {
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  rpe: number | null;
}

interface HistoryExercise {
  id: string;
  name: string;
  targetMuscleGroup: string;
  exerciseType: string;
  sets: HistorySet[];
}

interface HistorySession {
  sessionId: string;
  date: string;
  time: string;
  status: string;
  durationMin: number | null;
  exercises: HistoryExercise[];
}

function formatSet(set: HistorySet, exerciseType: string): string {
  if (exerciseType === 'WEIGHTED') {
    if (set.weightKg != null && set.reps != null) return `${set.weightKg}kg × ${set.reps}`;
    if (set.weightKg != null) return `${set.weightKg}kg`;
    if (set.reps != null) return `${set.reps} reps`;
  }
  if (exerciseType === 'BODYWEIGHT') {
    if (set.reps != null) return `${set.reps} reps`;
  }
  if (exerciseType === 'DURATION' || exerciseType === 'CARDIO') {
    if (set.durationSec != null) {
      const m = Math.floor(set.durationSec / 60);
      const s = set.durationSec % 60;
      return m > 0 ? `${m}m ${s}s` : `${s}s`;
    }
  }
  return '—';
}

function StatusPill({ status }: { status: string }) {
  const completed = status === 'COMPLETED';
  const cancelled = status === 'CANCELLED' || status === 'NO_SHOW';
  const Icon = completed ? CheckCircle2 : cancelled ? XCircle : Clock;
  const color = completed
    ? 'text-emerald-500 bg-emerald-500/10'
    : cancelled
      ? 'text-red-400 bg-red-500/10'
      : 'text-muted-foreground bg-muted';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${color}`}
    >
      <Icon className="h-3 w-3" />
      {status.toLowerCase().replace('_', ' ')}
    </span>
  );
}

function WorkoutHistoryList({ historyEndpoint }: { historyEndpoint: string }) {
  const [sessions, setSessions] = useState<HistorySession[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(historyEndpoint)
      .then((r) => r.json())
      .then(({ data }) => setSessions(data ?? []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [historyEndpoint]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center rounded-2xl ring-1 ring-border/40">
        <HistoryIcon className="h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">No workout history yet.</p>
        <p className="text-xs text-muted-foreground">
          Past sessions with logged exercises will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => {
        const date = new Date(s.date);
        const day = date.getDate();
        const month = date.toLocaleDateString('en-IN', { month: 'short' });
        const weekday = date.toLocaleDateString('en-IN', { weekday: 'short' });
        return (
          <div key={s.sessionId} className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10">
                <span className="text-base font-bold leading-none text-primary">{day}</span>
                <span className="text-[9px] font-medium uppercase text-primary/70">{month}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">
                    {weekday}, {month} {day}
                  </p>
                  <StatusPill status={s.status} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {s.time}
                  {s.durationMin != null && ` · ${s.durationMin} min`} · {s.exercises.length}{' '}
                  exercise{s.exercises.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2 border-t border-border/50 pt-3">
              {s.exercises.map((ex) => (
                <div key={ex.id} className="text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-foreground truncate">{ex.name}</p>
                    <p className="text-[10px] text-muted-foreground shrink-0">
                      {ex.targetMuscleGroup}
                    </p>
                  </div>
                  {ex.sets.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {ex.sets.map((set) => (
                        <span
                          key={set.setNumber}
                          className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {formatSet(set, ex.exerciseType)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function WorkoutProgressionPanel({
  exercises,
  chartEndpoint,
  historyEndpoint,
}: {
  exercises: ExerciseSummary[];
  chartEndpoint: string;
  historyEndpoint?: string;
}) {
  const [selected, setSelected] = useState<ExerciseSummary | null>(exercises[0] ?? null);
  const [activeSubTab, setActiveSubTab] = useState('viz');

  // Auto-select first exercise when list loads
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selected && exercises.length > 0) setSelected(exercises[0]!);
  }, [exercises, selected]);

  const hasExerciseData = exercises.length > 0;

  return (
    <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
      <TabsList
        variant="line"
        className="w-full justify-start gap-4 border-b border-border/50 px-0"
      >
        <TabsTrigger
          value="viz"
          className="px-1 text-xs font-medium focus-visible:ring-0 focus-visible:outline-none"
        >
          <LineChartIcon className="mr-1 h-3.5 w-3.5" />
          Visualization
        </TabsTrigger>
        <TabsTrigger
          value="prs"
          className="px-1 text-xs font-medium focus-visible:ring-0 focus-visible:outline-none"
        >
          <Trophy className="mr-1 h-3.5 w-3.5" />
          Personal Records
        </TabsTrigger>
        {historyEndpoint && (
          <TabsTrigger
            value="history"
            className="px-1 text-xs font-medium focus-visible:ring-0 focus-visible:outline-none"
          >
            <HistoryIcon className="mr-1 h-3.5 w-3.5" />
            History
          </TabsTrigger>
        )}
      </TabsList>

      {/* ── Visualization ── */}
      <TabsContent value="viz" className="mt-4 space-y-4">
        {!hasExerciseData ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center rounded-2xl ring-1 ring-border/40">
            <Dumbbell className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">No weight-based workout data yet.</p>
            <p className="text-xs text-muted-foreground">
              Sessions with logged sets and weights will appear here.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 flex-wrap">
              <ExerciseCombobox exercises={exercises} selected={selected} onSelect={setSelected} />
              <p className="text-xs text-muted-foreground">
                {exercises.length} exercise{exercises.length !== 1 ? 's' : ''} tracked
              </p>
            </div>
            {selected && <ExerciseChart exercise={selected} chartEndpoint={chartEndpoint} />}
          </>
        )}
      </TabsContent>

      {/* ── Personal Records ── */}
      <TabsContent value="prs" className="mt-4">
        {!hasExerciseData ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center rounded-2xl ring-1 ring-border/40">
            <Trophy className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">No personal records yet.</p>
          </div>
        ) : (
          <PRTable
            exercises={exercises}
            selectedId={selected?.id ?? null}
            onSelect={(ex) => {
              setSelected(ex);
              setActiveSubTab('viz');
            }}
          />
        )}
      </TabsContent>

      {/* ── History ── */}
      {historyEndpoint && (
        <TabsContent value="history" className="mt-4">
          <WorkoutHistoryList historyEndpoint={historyEndpoint} />
        </TabsContent>
      )}
    </Tabs>
  );
}
