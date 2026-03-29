'use client';

import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search, Dumbbell, ArrowUp, Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/40">
              {[
                'Exercise',
                'Type',
                'Muscle Group',
                'Start',
                'Current Best',
                'Improvement',
                'Sessions',
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground first:pl-4"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {exercises.map((ex) => {
              const improved = ex.improvement > 0;
              return (
                <tr
                  key={ex.id}
                  onClick={() => onSelect(ex)}
                  className={`border-b border-border/30 cursor-pointer transition-colors hover:bg-muted/30 ${
                    selectedId === ex.id ? 'bg-primary/5 ring-inset ring-1 ring-primary/20' : ''
                  }`}
                >
                  <td className="pl-4 pr-3 py-3 font-medium">{ex.name}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                        ex.exerciseType === 'WEIGHTED'
                          ? 'bg-blue-500/15 text-blue-400'
                          : ex.exerciseType === 'BODYWEIGHT'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : ex.exerciseType === 'DURATION'
                              ? 'bg-violet-500/15 text-violet-400'
                              : 'bg-orange-500/15 text-orange-400'
                      }`}
                    >
                      {ex.exerciseType}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground text-xs">
                    {ex.targetMuscleGroup}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {ex.startMax} {ex.unit}
                  </td>
                  <td className="px-3 py-3 font-semibold">
                    {ex.currentMax} {ex.unit}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`font-semibold ${improved ? 'text-emerald-500' : 'text-red-400'}`}
                    >
                      {improved ? '+' : ''}
                      {ex.improvement} {ex.unit}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{ex.sessionCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export default function WorkoutProgressionPanel({
  exercises,
  chartEndpoint,
}: {
  exercises: ExerciseSummary[];
  chartEndpoint: string;
}) {
  const [selected, setSelected] = useState<ExerciseSummary | null>(exercises[0] ?? null);

  // Auto-select first exercise when list loads
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!selected && exercises.length > 0) setSelected(exercises[0]!);
  }, [exercises, selected]);

  if (exercises.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center rounded-2xl ring-1 ring-border/40">
        <Dumbbell className="h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground text-sm">No weight-based workout data yet.</p>
        <p className="text-xs text-muted-foreground">
          Sessions with logged sets and weights will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Selector row */}
      <div className="flex items-center gap-3 flex-wrap">
        <ExerciseCombobox exercises={exercises} selected={selected} onSelect={setSelected} />
        <p className="text-xs text-muted-foreground">
          {exercises.length} exercise{exercises.length !== 1 ? 's' : ''} tracked
        </p>
      </div>

      {/* Chart for selected */}
      {selected && <ExerciseChart exercise={selected} chartEndpoint={chartEndpoint} />}

      {/* PR table */}
      <PRTable exercises={exercises} selectedId={selected?.id ?? null} onSelect={setSelected} />
    </div>
  );
}
