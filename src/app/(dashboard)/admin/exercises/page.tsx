'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Upload, Pencil, Trash2, Dumbbell } from 'lucide-react';
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

interface Exercise {
  id: string;
  name: string;
  targetMuscleGroup: string;
  secondaryMuscles: string[];
  equipmentRequired: string | null;
  difficulty: string | null;
  category: string;
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dumbbell className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Exercise Library</h1>
          <Badge variant="secondary">{pagination.total}</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBulkDialogOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Bulk Import
          </Button>
          <Button
            onClick={openCreateDialog}
            className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Exercise
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Target Muscle</TableHead>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingExercise ? 'Edit Exercise' : 'Add Exercise'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Bench Press"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Target Muscle *</Label>
                <Select
                  value={form.targetMuscleGroup}
                  onValueChange={(v) => setForm({ ...form, targetMuscleGroup: v ?? '' })}
                >
                  <SelectTrigger>
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
              <div>
                <Label>Category *</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v ?? 'HYPERTROPHY' })}
                >
                  <SelectTrigger>
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Difficulty</Label>
                <Select
                  value={form.difficulty}
                  onValueChange={(v) => setForm({ ...form, difficulty: v ?? '' })}
                >
                  <SelectTrigger>
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
              <div>
                <Label>Equipment</Label>
                <Input
                  value={form.equipmentRequired}
                  onChange={(e) => setForm({ ...form, equipmentRequired: e.target.value })}
                  placeholder="e.g. Barbell"
                />
              </div>
            </div>
            <div>
              <Label>Secondary Muscles (comma-separated)</Label>
              <Input
                value={form.secondaryMuscles}
                onChange={(e) => setForm({ ...form, secondaryMuscles: e.target.value })}
                placeholder="e.g. Triceps, Shoulders"
              />
            </div>
            <div>
              <Label>Instructions</Label>
              <Textarea
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                placeholder="Exercise instructions..."
                rows={3}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={saving || !form.name || !form.targetMuscleGroup}
            >
              {saving ? 'Saving...' : editingExercise ? 'Update Exercise' : 'Create Exercise'}
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
