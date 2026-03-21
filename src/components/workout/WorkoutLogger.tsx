'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Trash2, GripVertical, Save, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface ExerciseOption {
  id: string;
  name: string;
  targetMuscleGroup: string;
  category: string;
  equipmentRequired: string | null;
}

interface SetData {
  setNumber: number;
  reps: number | undefined;
  weightKg: number | undefined;
  durationSec: number | undefined;
  rpe: number | undefined;
  notes: string;
}

interface ExerciseEntry {
  tempId: string;
  exerciseId: string;
  exerciseName: string;
  targetMuscle: string;
  category: string;
  sets: SetData[];
  saved: boolean;
}

interface WorkoutLoggerProps {
  sessionInstanceId: string;
  existingLogs?: {
    id: string;
    exerciseId: string;
    orderIndex: number;
    exercise: { id: string; name: string; targetMuscleGroup: string; category: string };
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

export function WorkoutLogger({ sessionInstanceId, existingLogs }: WorkoutLoggerProps) {
  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ExerciseOption[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load existing workout logs
  useEffect(() => {
    if (existingLogs && existingLogs.length > 0) {
      setExercises(
        existingLogs.map((log) => ({
          tempId: log.id,
          exerciseId: log.exercise.id,
          exerciseName: log.exercise.name,
          targetMuscle: log.exercise.targetMuscleGroup,
          category: log.exercise.category,
          sets: log.sets.map((s) => ({
            setNumber: s.setNumber,
            reps: s.reps ?? undefined,
            weightKg: s.weightKg ?? undefined,
            durationSec: s.durationSec ?? undefined,
            rpe: s.rpe ?? undefined,
            notes: s.notes ?? '',
          })),
          saved: true,
        })),
      );
    }
  }, [existingLogs]);

  const searchExercises = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await fetch(`/api/exercises?search=${encodeURIComponent(query)}&pageSize=10`);
      if (res.ok) {
        const result = await res.json();
        setSearchResults(result.data);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchExercises(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchExercises]);

  function addExercise(exercise: ExerciseOption) {
    const newEntry: ExerciseEntry = {
      tempId: `temp-${Date.now()}`,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      targetMuscle: exercise.targetMuscleGroup,
      category: exercise.category,
      sets: [
        {
          setNumber: 1,
          reps: undefined,
          weightKg: undefined,
          durationSec: undefined,
          rpe: undefined,
          notes: '',
        },
      ],
      saved: false,
    };
    setExercises((prev) => [...prev, newEntry]);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    setSaved(false);
  }

  function removeExercise(tempId: string) {
    setExercises((prev) => prev.filter((e) => e.tempId !== tempId));
    setSaved(false);
  }

  function addSet(exerciseIndex: number) {
    setExercises((prev) => {
      const updated = [...prev];
      const entry = updated[exerciseIndex]!;
      entry.sets = [
        ...entry.sets,
        {
          setNumber: entry.sets.length + 1,
          reps: undefined,
          weightKg: undefined,
          durationSec: undefined,
          rpe: undefined,
          notes: '',
        },
      ];
      entry.saved = false;
      return updated;
    });
    setSaved(false);
  }

  function removeSet(exerciseIndex: number, setIndex: number) {
    setExercises((prev) => {
      const updated = [...prev];
      const entry = updated[exerciseIndex]!;
      entry.sets = entry.sets
        .filter((_, i) => i !== setIndex)
        .map((s, i) => ({ ...s, setNumber: i + 1 }));
      entry.saved = false;
      return updated;
    });
    setSaved(false);
  }

  function updateSet(exerciseIndex: number, setIndex: number, field: keyof SetData, value: string) {
    setExercises((prev) => {
      const updated = [...prev];
      const entry = updated[exerciseIndex]!;
      const set = { ...entry.sets[setIndex]! };

      if (field === 'notes') {
        set.notes = value;
      } else if (field === 'setNumber') {
        set.setNumber = parseInt(value) || 1;
      } else {
        const num = parseFloat(value);
        (set as Record<string, unknown>)[field] = isNaN(num) ? undefined : num;
      }

      entry.sets = [...entry.sets];
      entry.sets[setIndex] = set;
      entry.saved = false;
      return updated;
    });
    setSaved(false);
  }

  async function saveWorkout() {
    if (exercises.length === 0) return;
    setSaving(true);
    try {
      const payload = {
        sessionInstanceId,
        exercises: exercises.map((entry, idx) => ({
          exerciseId: entry.exerciseId,
          orderIndex: idx,
          sets: entry.sets.map((s) => ({
            setNumber: s.setNumber,
            reps: s.reps,
            weightKg: s.weightKg,
            durationSec: s.durationSec,
            rpe: s.rpe,
            notes: s.notes || undefined,
          })),
        })),
      };

      const res = await fetch('/api/trainer/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSaved(true);
        setExercises((prev) => prev.map((e) => ({ ...e, saved: true })));
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save workout');
      }
    } finally {
      setSaving(false);
    }
  }

  const hasUnsaved = exercises.some((e) => !e.saved);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">Workout Log</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowSearch(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Add Exercise
          </Button>
          {exercises.length > 0 && (
            <Button size="sm" onClick={saveWorkout} disabled={saving || !hasUnsaved}>
              {saving ? (
                'Saving...'
              ) : saved && !hasUnsaved ? (
                <>
                  <Check className="mr-1 h-3 w-3" /> Saved
                </>
              ) : (
                <>
                  <Save className="mr-1 h-3 w-3" /> Save
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Exercise Search */}
      {showSearch && (
        <Card>
          <CardContent className="pt-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search exercises..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowSearch(false);
                    setSearchQuery('');
                  }
                }}
              />
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-md border">
                {searchResults.map((ex) => (
                  <button
                    key={ex.id}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50"
                    onClick={() => addExercise(ex)}
                  >
                    <div>
                      <p className="font-medium">{ex.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {ex.targetMuscleGroup}{' '}
                        {ex.equipmentRequired ? `· ${ex.equipmentRequired}` : ''}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {ex.category}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
            {searchQuery && searchResults.length === 0 && (
              <p className="mt-2 text-center text-xs text-muted-foreground">No exercises found</p>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 w-full"
              onClick={() => {
                setShowSearch(false);
                setSearchQuery('');
              }}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Exercise List */}
      {exercises.length === 0 && !showSearch && (
        <div className="rounded-lg border border-dashed border-border/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No exercises logged yet. Tap &ldquo;Add Exercise&rdquo; to start.
          </p>
        </div>
      )}

      {exercises.map((entry, exIdx) => (
        <Card key={entry.tempId} className={entry.saved ? 'border-border/30' : 'border-primary/30'}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">{entry.exerciseName}</CardTitle>
                <Badge variant="outline" className="text-[10px]">
                  {entry.targetMuscle}
                </Badge>
              </div>
              <Button size="icon" variant="ghost" onClick={() => removeExercise(entry.tempId)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Sets table header */}
            <div className="mb-1 grid grid-cols-[2rem_1fr_1fr_1fr_2rem] gap-1 text-[10px] font-medium text-muted-foreground px-1">
              <span>Set</span>
              <span>Reps</span>
              <span>Weight (kg)</span>
              <span>RPE</span>
              <span></span>
            </div>

            {/* Sets */}
            {entry.sets.map((set, setIdx) => (
              <div
                key={setIdx}
                className="grid grid-cols-[2rem_1fr_1fr_1fr_2rem] gap-1 items-center mb-1"
              >
                <span className="text-center text-xs text-muted-foreground">{set.setNumber}</span>
                <Input
                  type="number"
                  placeholder="—"
                  className="h-8 text-xs"
                  value={set.reps ?? ''}
                  onChange={(e) => updateSet(exIdx, setIdx, 'reps', e.target.value)}
                />
                <Input
                  type="number"
                  placeholder="—"
                  className="h-8 text-xs"
                  value={set.weightKg ?? ''}
                  onChange={(e) => updateSet(exIdx, setIdx, 'weightKg', e.target.value)}
                />
                <Input
                  type="number"
                  placeholder="—"
                  className="h-8 text-xs"
                  min={1}
                  max={10}
                  value={set.rpe ?? ''}
                  onChange={(e) => updateSet(exIdx, setIdx, 'rpe', e.target.value)}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => removeSet(exIdx, setIdx)}
                  disabled={entry.sets.length <= 1}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            ))}

            <Button
              size="sm"
              variant="ghost"
              className="mt-1 w-full text-xs"
              onClick={() => addSet(exIdx)}
            >
              <Plus className="mr-1 h-3 w-3" /> Add Set
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
