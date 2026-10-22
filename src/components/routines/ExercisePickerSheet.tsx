'use client';

import { useEffect, useState } from 'react';
import { Check, Dumbbell, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { RoutineSheet } from './RoutineSheet';
import type { ExerciseLite } from './program-draft';

/**
 * Multi-select exercise search for the routine editor. Uses the same global
 * catalogue endpoint as the workout logger (`/api/exercises`, fuzzy search).
 * Exercises already in the routine are shown ticked and can't be re-added —
 * a routine holds each exercise once, like a session log.
 */
export function ExercisePickerSheet({
  open,
  onOpenChange,
  existingIds,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingIds: Set<string>;
  onAdd: (exercises: ExerciseLite[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ExerciseLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Map<string, ExerciseLite>>(new Map());

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelected(new Map());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ pageSize: '40' });
        if (query.trim()) params.set('search', query.trim());
        const res = await fetch(`/api/exercises?${params.toString()}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await res.json();
          setResults((json.data ?? []) as ExerciseLite[]);
        }
      } catch {
        // aborted or offline — keep the previous results
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  function toggle(ex: ExerciseLite) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(ex.id)) next.delete(ex.id);
      else next.set(ex.id, ex);
      return next;
    });
  }

  return (
    <RoutineSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add exercises"
      subtitle="Search the exercise library"
      icon={<Dumbbell className="h-4 w-4 text-primary" />}
      footer={
        <button
          disabled={selected.size === 0}
          onClick={() => {
            onAdd([...selected.values()]);
            onOpenChange(false);
          }}
          className="flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
        >
          {selected.size === 0
            ? 'Select exercises'
            : `Add ${selected.size} ${selected.size === 1 ? 'exercise' : 'exercises'}`}
        </button>
      }
    >
      <div className="sticky top-0 z-10 bg-background px-4 pb-2 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. lat pulldown, leg press"
            className="h-11 pl-10 text-base md:text-sm"
          />
        </div>
      </div>
      <div className="space-y-1 px-2 pb-3">
        {loading && results.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Searching…</p>
        )}
        {!loading && results.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No exercises found</p>
        )}
        {results.map((ex) => {
          const already = existingIds.has(ex.id);
          const isSelected = selected.has(ex.id);
          return (
            <button
              key={ex.id}
              disabled={already}
              onClick={() => toggle(ex)}
              className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                isSelected ? 'bg-primary/10' : 'active:bg-muted/50'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                  isSelected || already
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border'
                }`}
              >
                {(isSelected || already) && <Check className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{ex.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {ex.targetMuscleGroup} · {ex.exerciseType.toLowerCase()}
                  {already ? ' · already in routine' : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </RoutineSheet>
  );
}
