'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Upload,
  Pencil,
  Trash2,
  Dumbbell,
  Timer,
  Activity,
  User,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

type ExerciseType = 'WEIGHTED' | 'BODYWEIGHT' | 'DURATION' | 'CARDIO';

interface Exercise {
  id: string;
  isCompound: boolean;
  name: string;
  targetMuscleGroup: string;
  secondaryMuscles: string[];
  equipmentRequired: string | null;
  difficulty: string | null;
  category: string;
  exerciseType: ExerciseType;
  instructions: string | null;
  isActive: boolean;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const CATEGORIES = ['HYPERTROPHY', 'CARDIO', 'FLEXIBILITY', 'STRENGTH', 'FUNCTIONAL'];
const EXERCISE_TYPES: {
  value: ExerciseType;
  label: string;
  hint: string;
  icon: React.ElementType;
  iconClass: string;
}[] = [
  {
    value: 'WEIGHTED',
    label: 'Weighted',
    hint: 'Reps + weight (kg)',
    icon: Dumbbell,
    iconClass: 'text-blue-400',
  },
  {
    value: 'BODYWEIGHT',
    label: 'Bodyweight',
    hint: 'Reps only, no load',
    icon: User,
    iconClass: 'text-emerald-400',
  },
  {
    value: 'DURATION',
    label: 'Duration',
    hint: 'Hold time in seconds',
    icon: Timer,
    iconClass: 'text-violet-400',
  },
  {
    value: 'CARDIO',
    label: 'Cardio',
    hint: 'Duration + distance (km)',
    icon: Activity,
    iconClass: 'text-orange-400',
  },
];
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
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

export default function ExerciseLibraryPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [saving, setSaving] = useState(false);

  // Mobile accordion
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Bulk import
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkJson, setBulkJson] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  // Form state
  const [form, setForm] = useState({
    name: '',
    targetMuscleGroup: '',
    secondaryMuscles: '',
    equipmentRequired: '',
    difficulty: '',
    category: 'HYPERTROPHY',
    exerciseType: 'WEIGHTED' as ExerciseType,
    isCompound: false,
    instructions: '',
  });

  const fetchExercises = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: '20' });
        if (search) params.set('search', search);
        if (categoryFilter) params.set('category', categoryFilter);
        if (muscleFilter) params.set('muscleGroup', muscleFilter);

        const res = await fetch(`/api/admin/exercises?${params}`);
        if (res.ok) {
          const result = await res.json();
          setExercises(result.data);
          setPagination(result.pagination);
        }
      } finally {
        setLoading(false);
      }
    },
    [search, categoryFilter, muscleFilter],
  );

  useEffect(() => {
    fetchExercises();
  }, [fetchExercises]);

  function openCreateDialog() {
    setEditingExercise(null);
    setForm({
      name: '',
      targetMuscleGroup: '',
      secondaryMuscles: '',
      equipmentRequired: '',
      difficulty: '',
      category: 'HYPERTROPHY',
      exerciseType: 'WEIGHTED',
      isCompound: false,
      instructions: '',
    });
    setDialogOpen(true);
  }

  function openEditDialog(ex: Exercise) {
    setEditingExercise(ex);
    setForm({
      name: ex.name,
      targetMuscleGroup: ex.targetMuscleGroup,
      secondaryMuscles: ex.secondaryMuscles.join(', '),
      equipmentRequired: ex.equipmentRequired ?? '',
      difficulty: ex.difficulty ?? '',
      category: ex.category,
      exerciseType: ex.exerciseType,
      isCompound: ex.isCompound ?? false,
      instructions: ex.instructions ?? '',
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        targetMuscleGroup: form.targetMuscleGroup,
        secondaryMuscles: form.secondaryMuscles
          ? form.secondaryMuscles
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [],
        equipmentRequired: form.equipmentRequired || undefined,
        difficulty: form.difficulty || undefined,
        category: form.category,
        exerciseType: form.exerciseType,
        isCompound: form.isCompound,
        instructions: form.instructions || undefined,
      };

      const url = editingExercise
        ? `/api/admin/exercises/${editingExercise.id}`
        : '/api/admin/exercises';
      const method = editingExercise ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setDialogOpen(false);
        fetchExercises(pagination.page);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save exercise');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(exerciseId: string) {
    const ok = await confirm({
      title: 'Delete Exercise',
      description: 'Are you sure you want to delete this exercise?',
      confirmText: 'Delete',
      variant: 'destructive',
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/exercises/${exerciseId}`, { method: 'DELETE' });
    if (res.ok) {
      fetchExercises(pagination.page);
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to delete exercise');
    }
  }

  async function handleBulkImport() {
    setBulkLoading(true);
    try {
      const parsed = JSON.parse(bulkJson);
      const payload = Array.isArray(parsed) ? { exercises: parsed } : parsed;

      const res = await fetch('/api/admin/exercises/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const { data } = await res.json();
        toast.success(`Imported ${data.created} exercises. ${data.errors.length} errors.`);
        setBulkDialogOpen(false);
        setBulkJson('');
        fetchExercises();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to import');
      }
    } catch {
      toast.error('Invalid JSON format');
    } finally {
      setBulkLoading(false);
    }
  }

  const categoryBadgeColor = (cat: string) => {
    const colors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      HYPERTROPHY: 'default',
      STRENGTH: 'secondary',
      CARDIO: 'destructive',
      FLEXIBILITY: 'outline',
      FUNCTIONAL: 'secondary',
    };
    return colors[cat] ?? 'outline';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Exercise Library</h1>
          <Badge variant="secondary">{pagination.total}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Bulk Import</span>
            <span className="sm:hidden">Import</span>
          </Button>
          <Button
            onClick={openCreateDialog}
            className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Add Exercise</span>
            <span className="sm:hidden">Add</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search exercises..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? '')}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={muscleFilter} onValueChange={(v) => setMuscleFilter(v ?? '')}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Muscle Group" />
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

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : exercises.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No exercises found. Add your first exercise to get started.
        </div>
      ) : (
        <>
          {/* ── Desktop table ── */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Target Muscle</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Difficulty</TableHead>
                  <TableHead>Equipment</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exercises.map((ex) => (
                  <TableRow key={ex.id}>
                    <TableCell className="font-medium">{ex.name}</TableCell>
                    <TableCell>{ex.targetMuscleGroup}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
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
                    </TableCell>
                    <TableCell>
                      <Badge variant={categoryBadgeColor(ex.category)}>{ex.category}</Badge>
                    </TableCell>
                    <TableCell>{ex.difficulty ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {ex.equipmentRequired ?? 'None'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEditDialog(ex)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(ex.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* ── Mobile accordion cards ── */}
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border md:hidden">
            {exercises.map((ex) => {
              const isOpen = expandedId === ex.id;
              return (
                <div key={ex.id}>
                  {/* Card header — always visible */}
                  <button
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    onClick={() => setExpandedId(isOpen ? null : ex.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{ex.name}</p>
                      <p className="text-xs text-muted-foreground">{ex.targetMuscleGroup}</p>
                    </div>
                    <span
                      className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
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
                    {isOpen ? (
                      <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                  </button>

                  {/* Expanded details */}
                  {isOpen && (
                    <div className="border-t border-border/50 bg-muted/20 px-4 py-3 space-y-2">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Category
                          </p>
                          <Badge variant={categoryBadgeColor(ex.category)} className="mt-0.5">
                            {ex.category}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Difficulty
                          </p>
                          <p className="mt-0.5 font-medium">{ex.difficulty ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Equipment
                          </p>
                          <p className="mt-0.5 text-muted-foreground">
                            {ex.equipmentRequired ?? 'None'}
                          </p>
                        </div>
                        {ex.isCompound && (
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Type
                            </p>
                            <p className="mt-0.5 text-xs font-medium text-orange-400">Compound</p>
                          </div>
                        )}
                      </div>
                      {ex.secondaryMuscles.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Secondary Muscles
                          </p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {ex.secondaryMuscles.join(', ')}
                          </p>
                        </div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => openEditDialog(ex)}
                        >
                          <Pencil className="mr-1.5 h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(ex.id)}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page <= 1}
                  onClick={() => fetchExercises(pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => fetchExercises(pagination.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          showCloseButton={false}
          className={[
            // Mobile: bottom sheet
            'max-sm:!top-auto max-sm:!bottom-0 max-sm:!left-0 max-sm:!right-0',
            'max-sm:!translate-x-0 max-sm:!translate-y-0',
            'max-sm:!max-w-full max-sm:!w-full',
            'max-sm:!rounded-b-none max-sm:!rounded-t-2xl',
            // Desktop: centered modal
            'sm:max-w-lg',
            // Shared
            'overflow-hidden p-0 gap-0',
          ].join(' ')}
        >
          {/* Drag handle — mobile only */}
          <div className="flex justify-center pt-2.5 pb-0 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-muted-foreground/25" />
          </div>

          {/* Branded header */}
          <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 px-5 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 ring-1 ring-primary/30">
                <Dumbbell className="h-4 w-4 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-sm font-bold text-white">
                  {editingExercise ? 'Edit Exercise' : 'New Exercise'}
                </DialogTitle>
                <p className="text-xs text-white/50 mt-0.5">
                  {editingExercise ? 'Update exercise details' : 'Add to your exercise library'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setDialogOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-white/80 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="max-h-[calc(100dvh-230px)] overflow-y-auto px-5 py-4 space-y-4 sm:max-h-[58vh] sm:px-6 sm:py-5 sm:space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Exercise Name <span className="text-primary">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Bench Press"
                className="h-11 text-sm"
              />
            </div>

            {/* Row 2: Target Muscle + Category */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Target Muscle <span className="text-primary">*</span>
                </Label>
                <Select
                  value={form.targetMuscleGroup}
                  onValueChange={(v) => setForm({ ...form, targetMuscleGroup: v ?? '' })}
                >
                  <SelectTrigger className="h-11 w-full text-sm">
                    <SelectValue placeholder="Select muscle" />
                  </SelectTrigger>
                  <SelectContent>
                    {MUSCLE_GROUPS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Category <span className="text-primary">*</span>
                </Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v ?? 'HYPERTROPHY' })}
                >
                  <SelectTrigger className="h-11 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: Exercise Type + Difficulty */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Exercise Type <span className="text-primary">*</span>
                </Label>
                <Select
                  value={form.exerciseType}
                  onValueChange={(v) =>
                    setForm({ ...form, exerciseType: (v ?? 'WEIGHTED') as ExerciseType })
                  }
                >
                  <SelectTrigger className="h-11 w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXERCISE_TYPES.map((t) => {
                      const Icon = t.icon;
                      return (
                        <SelectItem key={t.value} value={t.value}>
                          <div className="flex items-center gap-2">
                            <Icon className={`h-3.5 w-3.5 ${t.iconClass}`} />
                            <span className="font-medium">{t.label}</span>
                            <span className="hidden text-xs text-muted-foreground sm:inline">
                              — {t.hint}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Difficulty
                </Label>
                <Select
                  value={form.difficulty}
                  onValueChange={(v) => setForm({ ...form, difficulty: v ?? '' })}
                >
                  <SelectTrigger className="h-11 w-full text-sm">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 4: Equipment + Secondary Muscles side-by-side on mobile */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Equipment
                </Label>
                <Input
                  value={form.equipmentRequired}
                  onChange={(e) => setForm({ ...form, equipmentRequired: e.target.value })}
                  placeholder="e.g. Barbell, Bench"
                  className="h-11 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Secondary Muscles
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/60">
                    (comma-sep.)
                  </span>
                </Label>
                <Input
                  value={form.secondaryMuscles}
                  onChange={(e) => setForm({ ...form, secondaryMuscles: e.target.value })}
                  placeholder="e.g. Triceps, Shoulders"
                  className="h-11 text-sm"
                />
              </div>
            </div>

            {/* Is Compound */}
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Compound Exercise</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Show on leaderboard (Squat, Bench, Deadlift, etc.)
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.isCompound}
                onClick={() => setForm({ ...form, isCompound: !form.isCompound })}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  form.isCompound ? 'bg-orange-500' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    form.isCompound ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Instructions */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Instructions
              </Label>
              <Textarea
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                placeholder="Step-by-step exercise cues..."
                rows={3}
                className="resize-none text-sm"
              />
            </div>
          </div>

          {/* Sticky footer */}
          <div className="flex gap-2.5 border-t border-border/60 bg-muted/20 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-primary hover:bg-primary/90"
              onClick={handleSave}
              disabled={saving || !form.name || !form.targetMuscleGroup}
            >
              {saving ? 'Saving…' : editingExercise ? 'Update Exercise' : 'Create Exercise'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Import Exercises</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Paste a JSON array of exercises. Each entry needs: name, targetMuscleGroup, category.
            </p>
            <Textarea
              value={bulkJson}
              onChange={(e) => setBulkJson(e.target.value)}
              placeholder={`[
  {
    "name": "Bench Press",
    "targetMuscleGroup": "Chest",
    "category": "HYPERTROPHY",
    "equipmentRequired": "Barbell"
  }
]`}
              rows={10}
              className="font-mono text-xs"
            />
            <Button
              className="w-full"
              onClick={handleBulkImport}
              disabled={bulkLoading || !bulkJson.trim()}
            >
              {bulkLoading ? 'Importing...' : 'Import Exercises'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </div>
  );
}
