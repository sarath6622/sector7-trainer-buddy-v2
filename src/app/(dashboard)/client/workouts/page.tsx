'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Clock, Dumbbell, Filter, User, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface WorkoutLog {
  id: string;
  orderIndex: number;
  exercise: {
    id: string;
    name: string;
    targetMuscleGroup: string;
    category: string;
    equipmentRequired: string | null;
  };
  sets: {
    setNumber: number;
    reps: number | null;
    weightKg: number | null;
    durationSec: number | null;
    rpe: number | null;
    notes: string | null;
  }[];
  sessionInstance: {
    id: string;
    scheduledDate: string;
    scheduledTime: string;
    status: string;
    trainer: {
      user: { firstName: string; lastName: string };
    };
  };
}

const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Forearms',
  'Quadriceps',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Core',
  'Full Body',
];

export default function ClientWorkoutsPage() {
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [muscleFilter, setMuscleFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const fetchWorkouts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (muscleFilter && muscleFilter !== 'all') params.set('muscleGroup', muscleFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await fetch(`/api/client/workouts?${params}`);
      if (res.ok) {
        const { data } = await res.json();
        setWorkouts(data);
      }
    } finally {
      setLoading(false);
    }
  }, [muscleFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchWorkouts();
  }, [fetchWorkouts]);

  // Group workouts by session
  const groupedBySession = workouts.reduce<
    Record<
      string,
      { date: string; time: string; trainer: string; sessionId: string; exercises: WorkoutLog[] }
    >
  >((acc, log) => {
    const key = log.sessionInstance.id;
    if (!acc[key]) {
      const s = log.sessionInstance;
      acc[key] = {
        date: s.scheduledDate,
        time: s.scheduledTime,
        trainer: `${s.trainer.user.firstName} ${s.trainer.user.lastName}`,
        sessionId: s.id,
        exercises: [],
      };
    }
    acc[key]!.exercises.push(log);
    return acc;
  }, {});

  const sessions = Object.values(groupedBySession).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  function formatTime(timeStr: string) {
    const [h = '0', m = '00'] = timeStr.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }

  const hasActiveFilters = muscleFilter || dateFrom || dateTo;

  const totalExercises = workouts.length;
  const totalSets = workouts.reduce((sum, w) => sum + w.sets.length, 0);

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workout History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review your training sessions and progress
        </p>
      </div>

      {/* Quick stats */}
      {!loading && workouts.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-card p-3 ring-1 ring-border/50">
            <span className="text-xl font-bold text-primary">{sessions.length}</span>
            <span className="text-[10px] text-muted-foreground">Sessions</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-card p-3 ring-1 ring-border/50">
            <span className="text-xl font-bold text-emerald-500">{totalExercises}</span>
            <span className="text-[10px] text-muted-foreground">Exercises</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-2xl bg-card p-3 ring-1 ring-border/50">
            <span className="text-xl font-bold text-blue-500">{totalSets}</span>
            <span className="text-[10px] text-muted-foreground">Total Sets</span>
          </div>
        </div>
      )}

      {/* Filter toggle */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex w-full items-center justify-between p-4"
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters</span>
            {hasActiveFilters && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {[muscleFilter, dateFrom, dateTo].filter(Boolean).length}
              </span>
            )}
          </div>
          {showFilters ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {showFilters && (
          <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Muscle Group
              </label>
              <Select value={muscleFilter} onValueChange={(v) => setMuscleFilter(v ?? '')}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="All muscle groups" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Muscles</SelectItem>
                  {MUSCLE_GROUPS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  From
                </label>
                <Input
                  type="date"
                  className="rounded-xl"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">To</label>
                <Input
                  type="date"
                  className="rounded-xl"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>
            {hasActiveFilters && (
              <button
                onClick={() => {
                  setMuscleFilter('');
                  setDateFrom('');
                  setDateTo('');
                }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3 w-3" />
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Loading workouts...</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && sessions.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Dumbbell className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="font-medium">No workout history found</p>
          <p className="text-sm text-muted-foreground">
            {hasActiveFilters
              ? 'Try adjusting your filters'
              : 'Your workouts will appear here after training sessions'}
          </p>
        </div>
      )}

      {/* Workout sessions */}
      {!loading && sessions.length > 0 && (
        <div className="space-y-3">
          {sessions.map((session) => {
            const isExpanded = expandedSession === session.sessionId;
            const day = new Date(session.date).getDate();
            const monthShort = new Date(session.date).toLocaleDateString('en-IN', {
              month: 'short',
            });
            const uniqueMuscles = [
              ...new Set(session.exercises.map((e) => e.exercise.targetMuscleGroup)),
            ];

            return (
              <div
                key={session.sessionId}
                className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/50"
              >
                {/* Session header — always visible */}
                <button
                  onClick={() => setExpandedSession(isExpanded ? null : session.sessionId)}
                  className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/30"
                >
                  {/* Date block */}
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10">
                    <span className="text-base font-bold leading-none text-primary">{day}</span>
                    <span className="text-[9px] font-medium uppercase text-primary/70">
                      {monthShort}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{formatDate(session.date)}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatTime(session.time)}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {session.trainer}
                      </span>
                    </div>
                    {/* Muscle tags */}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {uniqueMuscles.map((muscle) => (
                        <span
                          key={muscle}
                          className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-medium text-primary"
                        >
                          {muscle}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">
                      {session.exercises.length} exercise{session.exercises.length > 1 ? 's' : ''}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {/* Expanded exercise details */}
                {isExpanded && (
                  <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-3">
                    {session.exercises.map((log, i) => (
                      <div key={log.id}>
                        {i > 0 && <div className="mb-3 border-t border-border/30" />}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted text-[10px] font-bold text-muted-foreground">
                              {i + 1}
                            </span>
                            <span className="text-sm font-semibold">{log.exercise.name}</span>
                          </div>
                          {log.exercise.equipmentRequired && (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] text-muted-foreground">
                              {log.exercise.equipmentRequired}
                            </span>
                          )}
                        </div>

                        {/* Sets table */}
                        <div className="ml-8 overflow-hidden rounded-xl bg-muted/40 ring-1 ring-border/30">
                          <div className="grid grid-cols-4 gap-px bg-border/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <div className="bg-muted/60 px-3 py-2">Set</div>
                            <div className="bg-muted/60 px-3 py-2">Reps</div>
                            <div className="bg-muted/60 px-3 py-2">Weight</div>
                            <div className="bg-muted/60 px-3 py-2">RPE</div>
                          </div>
                          {log.sets.map((set) => (
                            <div
                              key={set.setNumber}
                              className="grid grid-cols-4 gap-px bg-border/30 text-xs"
                            >
                              <div className="bg-card px-3 py-2 font-medium text-muted-foreground">
                                {set.setNumber}
                              </div>
                              <div className="bg-card px-3 py-2 font-semibold">
                                {set.reps ?? '—'}
                              </div>
                              <div className="bg-card px-3 py-2">
                                {set.weightKg ? (
                                  <span className="font-semibold">
                                    {set.weightKg}
                                    <span className="ml-0.5 text-[10px] text-muted-foreground">
                                      kg
                                    </span>
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </div>
                              <div className="bg-card px-3 py-2">
                                {set.rpe ? (
                                  <span
                                    className={
                                      set.rpe >= 9
                                        ? 'font-bold text-red-500'
                                        : set.rpe >= 7
                                          ? 'font-medium text-amber-500'
                                          : ''
                                    }
                                  >
                                    {set.rpe}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Set summary */}
                        {log.sets.length > 0 && (
                          <div className="ml-8 mt-1.5 flex gap-3 text-[10px] text-muted-foreground">
                            <span>{log.sets.length} sets</span>
                            {log.sets.some((s) => s.reps) && (
                              <span>
                                {log.sets.reduce((sum, s) => sum + (s.reps ?? 0), 0)} total reps
                              </span>
                            )}
                            {log.sets.some((s) => s.weightKg) && (
                              <span>
                                Max {Math.max(...log.sets.map((s) => s.weightKg ?? 0))} kg
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
