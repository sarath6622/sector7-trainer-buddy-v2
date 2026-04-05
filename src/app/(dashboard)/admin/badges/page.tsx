'use client';

import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Plus, Search, Pencil, Trash2, Trophy, X, Upload as UploadIcon } from 'lucide-react';
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
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Types ──────────────────────────────────────────────────────────────────

type BadgeType =
  | 'STREAK'
  | 'PERSONAL_RECORD'
  | 'BODY_COMPOSITION'
  | 'SESSION_MILESTONE'
  | 'WEIGHT_LIFTED'
  | 'EXERCISE_MILESTONE';
type GenderFilter = 'MALE' | 'FEMALE' | 'ALL';
type ThresholdUnit = 'KG' | 'REPS' | 'SECONDS';
type DurationCondition = 'LONGER_IS_BETTER' | 'SHORTER_IS_BETTER';
type ExerciseType = 'WEIGHTED' | 'BODYWEIGHT' | 'DURATION' | 'CARDIO';

interface BadgeDefinition {
  id: string;
  type: BadgeType;
  name: string;
  description: string;
  icon: string;
  imageUrl: string | null;
  thresholdValue: number | null;
  thresholdUnit: ThresholdUnit | null;
  durationCondition: DurationCondition | null;
  genderFilter: GenderFilter;
  exerciseId: string | null;
  howToEarn: string | null;
  isActive: boolean;
  exercise: { id: string; name: string } | null;
}

interface ExerciseOption {
  id: string;
  name: string;
  exerciseType: ExerciseType;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const BADGE_TYPES: { value: BadgeType; label: string }[] = [
  { value: 'STREAK', label: 'Streak' },
  { value: 'SESSION_MILESTONE', label: 'Session Milestone' },
  { value: 'PERSONAL_RECORD', label: 'Personal Record' },
  { value: 'BODY_COMPOSITION', label: 'Body Composition' },
  { value: 'WEIGHT_LIFTED', label: 'Weight Lifted' },
  { value: 'EXERCISE_MILESTONE', label: 'Exercise Milestone' },
];

const GENDER_FILTERS: { value: GenderFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
];

const typeBadgeColor = (type: BadgeType) => {
  const colors: Record<BadgeType, string> = {
    STREAK: 'bg-orange-500/15 text-orange-400',
    SESSION_MILESTONE: 'bg-blue-500/15 text-blue-400',
    PERSONAL_RECORD: 'bg-emerald-500/15 text-emerald-400',
    BODY_COMPOSITION: 'bg-violet-500/15 text-violet-400',
    WEIGHT_LIFTED: 'bg-red-500/15 text-red-400',
    EXERCISE_MILESTONE: 'bg-cyan-500/15 text-cyan-400',
  };
  return colors[type] ?? '';
};

// ─── Component ──────────────────────────────────────────────────────────────

export default function BadgeDefinitionsPage() {
  const { confirm, ConfirmDialog } = useConfirm();
  const [badges, setBadges] = useState<BadgeDefinition[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [genderFilterVal, setGenderFilterVal] = useState('');

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBadge, setEditingBadge] = useState<BadgeDefinition | null>(null);
  const [saving, setSaving] = useState(false);

  // Exercises for WEIGHT_LIFTED picker
  const [exercises, setExercises] = useState<ExerciseOption[]>([]);

  // Image upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Form
  const emptyForm = {
    type: 'STREAK' as BadgeType,
    name: '',
    description: '',
    howToEarn: '',
    icon: '🏆',
    imageUrl: '',
    thresholdValue: '',
    thresholdUnit: '' as ThresholdUnit | '',
    durationCondition: '' as DurationCondition | '',
    exerciseId: '',
    genderFilter: 'ALL' as GenderFilter,
    isActive: true,
  };
  const [form, setForm] = useState(emptyForm);

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchBadges = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), pageSize: '20' });
        if (search) params.set('search', search);
        if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter);
        if (genderFilterVal && genderFilterVal !== 'all')
          params.set('genderFilter', genderFilterVal);

        const res = await fetch(`/api/admin/badges?${params}`);
        if (res.ok) {
          const result = await res.json();
          setBadges(result.data);
          setPagination(result.pagination);
        }
      } finally {
        setLoading(false);
      }
    },
    [search, typeFilter, genderFilterVal],
  );

  useEffect(() => {
    fetchBadges();
  }, [fetchBadges]);

  // Load exercises once for the WEIGHT_LIFTED picker
  useEffect(() => {
    fetch('/api/admin/exercises?pageSize=500')
      .then((r) => r.json())
      .then((result) =>
        setExercises(
          result.data?.map((e: { id: string; name: string; exerciseType: ExerciseType }) => ({
            id: e.id,
            name: e.name,
            exerciseType: e.exerciseType,
          })) ?? [],
        ),
      )
      .catch(() => {});
  }, []);

  // ─── Dialog handlers ─────────────────────────────────────────────────────

  function openCreateDialog() {
    setEditingBadge(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditDialog(badge: BadgeDefinition) {
    setEditingBadge(badge);
    setForm({
      type: badge.type,
      name: badge.name,
      description: badge.description,
      howToEarn: badge.howToEarn ?? '',
      icon: badge.icon,
      imageUrl: badge.imageUrl ?? '',
      thresholdValue: badge.thresholdValue != null ? String(badge.thresholdValue) : '',
      thresholdUnit: badge.thresholdUnit ?? '',
      durationCondition: badge.durationCondition ?? '',
      exerciseId: badge.exerciseId ?? '',
      genderFilter: badge.genderFilter,
      isActive: badge.isActive,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name || !form.description) {
      toast.error('Name and description are required');
      return;
    }
    const needsExercise = form.type === 'WEIGHT_LIFTED' || form.type === 'EXERCISE_MILESTONE';
    if (needsExercise && (!form.thresholdValue || !form.exerciseId)) {
      toast.error('Exercise-based badges require a threshold and exercise');
      return;
    }
    if (form.type === 'EXERCISE_MILESTONE' && !form.thresholdUnit) {
      toast.error('Exercise milestone badges require a threshold unit');
      return;
    }
    if (
      form.type === 'EXERCISE_MILESTONE' &&
      form.thresholdUnit === 'SECONDS' &&
      !form.durationCondition
    ) {
      toast.error('Duration badges require a condition (longer or shorter is better)');
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        type: form.type,
        name: form.name,
        description: form.description,
        howToEarn: form.howToEarn || undefined,
        icon: form.icon || '🏆',
        imageUrl: form.imageUrl || undefined,
        genderFilter: form.genderFilter,
        isActive: form.isActive,
      };
      if (form.thresholdValue) payload.thresholdValue = Number(form.thresholdValue);
      if (form.exerciseId) payload.exerciseId = form.exerciseId;
      if (form.thresholdUnit) payload.thresholdUnit = form.thresholdUnit;
      if (form.durationCondition) payload.durationCondition = form.durationCondition;

      const url = editingBadge ? `/api/admin/badges/${editingBadge.id}` : '/api/admin/badges';
      const method = editingBadge ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setDialogOpen(false);
        fetchBadges(pagination.page);
        toast.success(editingBadge ? 'Badge updated' : 'Badge created');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save badge');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(badgeId: string) {
    const ok = await confirm({
      title: 'Deactivate Badge',
      description:
        'This will deactivate the badge definition. Clients who already earned it will keep it, but it will no longer appear as a locked badge for new clients.',
      confirmText: 'Deactivate',
      variant: 'destructive',
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/badges/${badgeId}`, { method: 'DELETE' });
    if (res.ok) {
      fetchBadges(pagination.page);
      toast.success('Badge deactivated');
    } else {
      const err = await res.json();
      toast.error(err.error || 'Failed to deactivate badge');
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 512 * 1024) {
      toast.error('Image must be under 512 KB');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/admin/badges/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const { url } = await res.json();
        setForm((prev) => ({ ...prev, imageUrl: url }));
        toast.success('Image uploaded');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Upload failed');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-amber-500" />
          <h1 className="text-2xl font-bold">Badge Definitions</h1>
          <Badge variant="secondary">{pagination.total}</Badge>
        </div>
        <Button
          onClick={openCreateDialog}
          className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Badge
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search badges..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? '')}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Badge Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {BADGE_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={genderFilterVal} onValueChange={(v) => setGenderFilterVal(v ?? '')}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Genders</SelectItem>
            {GENDER_FILTERS.map((g) => (
              <SelectItem key={g.value} value={g.value}>
                {g.label}
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
      ) : badges.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No badge definitions found. Create your first badge to get started.
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Icon</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Threshold</TableHead>
                <TableHead>Gender</TableHead>
                <TableHead>Exercise</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {badges.map((b) => (
                <TableRow key={b.id} className={!b.isActive ? 'opacity-50' : ''}>
                  <TableCell>
                    {b.imageUrl ? (
                      <img src={b.imageUrl} alt={b.name} className="h-8 w-8 object-contain" />
                    ) : (
                      <span className="text-2xl">{b.icon}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeBadgeColor(b.type)}`}
                    >
                      {b.type.replace('_', ' ')}
                    </span>
                  </TableCell>
                  <TableCell>
                    {b.thresholdValue != null ? (
                      <span>
                        {b.thresholdValue}
                        {b.thresholdUnit === 'KG' && ' kg'}
                        {b.thresholdUnit === 'REPS' && ' reps'}
                        {b.thresholdUnit === 'SECONDS' && (
                          <>
                            {' '}
                            sec{' '}
                            {b.durationCondition === 'SHORTER_IS_BETTER' ? '(faster)' : '(longer)'}
                          </>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">{b.genderFilter}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {b.exercise?.name ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={b.isActive ? 'default' : 'secondary'}>
                      {b.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditDialog(b)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {b.isActive && (
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(b.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
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
                  onClick={() => fetchBadges(pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => fetchBadges(pagination.page + 1)}
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
        <DialogContent className="max-w-xl overflow-hidden p-0 gap-0">
          {/* Header */}
          <div className="relative bg-gradient-to-br from-slate-800 to-slate-900 px-6 py-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              {/* Live badge preview */}
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20 ring-1 ring-amber-500/30">
                {form.imageUrl ? (
                  <img src={form.imageUrl} alt="" className="h-8 w-8 object-contain" />
                ) : (
                  <span className="text-2xl leading-none">{form.icon || '🏆'}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base font-bold text-white truncate">
                  {form.name || (editingBadge ? 'Edit Badge' : 'New Badge')}
                </DialogTitle>
                <p className="text-xs text-white/50 mt-0.5 truncate">
                  {form.description ||
                    (editingBadge
                      ? 'Update badge definition'
                      : 'Configure a new achievement badge')}
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
          <div className="max-h-[68vh] overflow-y-auto px-6 py-6 space-y-6">
            {/* ── Section 1: Badge Identity ── */}
            <fieldset className="space-y-4">
              <legend className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-1">
                Badge Identity
              </legend>

              {/* Type + Gender row */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Type <span className="text-amber-500">*</span>
                  </Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm({ ...form, type: (v ?? 'STREAK') as BadgeType })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BADGE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Gender Filter
                  </Label>
                  <Select
                    value={form.genderFilter}
                    onValueChange={(v) =>
                      setForm({ ...form, genderFilter: (v ?? 'ALL') as GenderFilter })
                    }
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GENDER_FILTERS.map((g) => (
                        <SelectItem key={g.value} value={g.value}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Name */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Name <span className="text-amber-500">*</span>
                </Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. 100kg Bench Press Club"
                  className="h-10"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Description <span className="text-amber-500">*</span>
                </Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description shown on badge card"
                  rows={2}
                  className="resize-none"
                />
              </div>
            </fieldset>

            <hr className="border-border/40" />

            {/* ── Section 2: Criteria ── */}
            <fieldset className="space-y-4">
              <legend className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-1">
                Earning Criteria
              </legend>

              {/* Exercise picker (WEIGHT_LIFTED and EXERCISE_MILESTONE) */}
              {(form.type === 'WEIGHT_LIFTED' || form.type === 'EXERCISE_MILESTONE') && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Exercise <span className="text-amber-500">*</span>
                  </Label>
                  <Select
                    value={form.exerciseId}
                    onValueChange={(v) => {
                      const ex = exercises.find((e) => e.id === v);
                      const autoUnit: ThresholdUnit | '' = ex
                        ? ex.exerciseType === 'BODYWEIGHT'
                          ? 'REPS'
                          : ex.exerciseType === 'DURATION' || ex.exerciseType === 'CARDIO'
                            ? 'SECONDS'
                            : 'KG'
                        : '';
                      setForm({
                        ...form,
                        exerciseId: v ?? '',
                        ...(form.type === 'EXERCISE_MILESTONE'
                          ? {
                              thresholdUnit: autoUnit,
                              durationCondition:
                                autoUnit === 'SECONDS'
                                  ? form.durationCondition || 'LONGER_IS_BETTER'
                                  : '',
                            }
                          : {}),
                      });
                    }}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select exercise..." />
                    </SelectTrigger>
                    <SelectContent>
                      {exercises.map((ex) => (
                        <SelectItem key={ex.id} value={ex.id}>
                          <span className="flex items-center gap-2">
                            {ex.name}
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                              {ex.exerciseType.toLowerCase()}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Threshold unit + duration condition (EXERCISE_MILESTONE only) */}
              {form.type === 'EXERCISE_MILESTONE' && (
                <div
                  className={`grid gap-4 ${form.thresholdUnit === 'SECONDS' ? 'grid-cols-2' : 'grid-cols-1'}`}
                >
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground">
                      Measurement <span className="text-amber-500">*</span>
                    </Label>
                    <Select
                      value={form.thresholdUnit}
                      onValueChange={(v) =>
                        setForm({
                          ...form,
                          thresholdUnit: (v ?? '') as ThresholdUnit | '',
                          durationCondition:
                            v === 'SECONDS' ? form.durationCondition || 'LONGER_IS_BETTER' : '',
                        })
                      }
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Auto-detected from exercise" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="KG">Weight (kg)</SelectItem>
                        <SelectItem value="REPS">Reps</SelectItem>
                        <SelectItem value="SECONDS">Duration (seconds)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {form.thresholdUnit === 'SECONDS' && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground">
                        Condition <span className="text-amber-500">*</span>
                      </Label>
                      <Select
                        value={form.durationCondition}
                        onValueChange={(v) =>
                          setForm({
                            ...form,
                            durationCondition: (v ?? '') as DurationCondition | '',
                          })
                        }
                      >
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="LONGER_IS_BETTER">
                            Longer is better (plank, wall sit)
                          </SelectItem>
                          <SelectItem value="SHORTER_IS_BETTER">
                            Shorter is better (sprint, run)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {/* Threshold value */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Threshold Value
                  {(form.type === 'WEIGHT_LIFTED' || form.type === 'EXERCISE_MILESTONE') && (
                    <span className="text-amber-500"> *</span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    type="number"
                    value={form.thresholdValue}
                    onChange={(e) => setForm({ ...form, thresholdValue: e.target.value })}
                    placeholder={
                      form.type === 'STREAK'
                        ? 'e.g. 5'
                        : form.type === 'WEIGHT_LIFTED'
                          ? 'e.g. 100'
                          : form.type === 'EXERCISE_MILESTONE'
                            ? form.thresholdUnit === 'KG'
                              ? 'e.g. 100'
                              : form.thresholdUnit === 'REPS'
                                ? 'e.g. 50'
                                : form.thresholdUnit === 'SECONDS'
                                  ? 'e.g. 60'
                                  : 'Select exercise first'
                            : form.type === 'BODY_COMPOSITION'
                              ? 'e.g. 3'
                              : form.type === 'SESSION_MILESTONE'
                                ? 'e.g. 100'
                                : 'e.g. 10'
                    }
                    className="h-10 pr-20"
                  />
                  {/* Unit suffix */}
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                    {form.type === 'STREAK'
                      ? 'sessions'
                      : form.type === 'SESSION_MILESTONE'
                        ? 'sessions'
                        : form.type === 'WEIGHT_LIFTED'
                          ? 'kg'
                          : form.type === 'BODY_COMPOSITION'
                            ? 'kg lost'
                            : form.type === 'EXERCISE_MILESTONE'
                              ? form.thresholdUnit === 'KG'
                                ? 'kg'
                                : form.thresholdUnit === 'REPS'
                                  ? 'reps'
                                  : form.thresholdUnit === 'SECONDS'
                                    ? 'seconds'
                                    : ''
                              : ''}
                  </span>
                </div>
              </div>

              {/* How to Earn */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  How to Earn{' '}
                  <span className="text-muted-foreground/50 font-normal normal-case">
                    (shown on locked badges)
                  </span>
                </Label>
                <Textarea
                  value={form.howToEarn}
                  onChange={(e) => setForm({ ...form, howToEarn: e.target.value })}
                  placeholder="e.g. Complete 100 sessions to unlock this badge"
                  rows={2}
                  className="resize-none"
                />
              </div>
            </fieldset>

            <hr className="border-border/40" />

            {/* ── Section 3: Appearance ── */}
            <fieldset className="space-y-4">
              <legend className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-1">
                Appearance
              </legend>

              <div className="flex items-start gap-5">
                {/* Emoji */}
                <div className="space-y-2 shrink-0">
                  <Label className="text-xs font-semibold text-muted-foreground">Emoji</Label>
                  <Input
                    value={form.icon}
                    onChange={(e) => setForm({ ...form, icon: e.target.value })}
                    className="h-12 w-14 text-center text-2xl p-0"
                    maxLength={4}
                  />
                </div>

                {/* Divider */}
                <div className="flex flex-col items-center gap-1 pt-7 text-muted-foreground/40">
                  <div className="h-4 w-px bg-border" />
                  <span className="text-[10px]">or</span>
                  <div className="h-4 w-px bg-border" />
                </div>

                {/* Custom image */}
                <div className="space-y-2 flex-1">
                  <Label className="text-xs font-semibold text-muted-foreground">
                    Custom Image
                  </Label>
                  {form.imageUrl ? (
                    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                      <img
                        src={form.imageUrl}
                        alt="Badge"
                        className="h-10 w-10 rounded-md object-contain"
                      />
                      <span className="text-xs text-muted-foreground flex-1 truncate">
                        Badge image uploaded
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive hover:text-destructive"
                        onClick={() => setForm({ ...form, imageUrl: '' })}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-muted/40"
                    >
                      <UploadIcon className="h-4 w-4" />
                      {uploading ? 'Uploading...' : 'Upload PNG, JPG, or WebP (max 512 KB)'}
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
              </div>
            </fieldset>

            {/* Active toggle (edit mode) */}
            {editingBadge && (
              <>
                <hr className="border-border/40" />
                <div className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Active</p>
                    <p className="text-xs text-muted-foreground">
                      Visible to clients as a locked or earned badge
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t border-border/60 bg-muted/20 px-6 py-4">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-primary hover:bg-primary/90"
              onClick={handleSave}
              disabled={saving || !form.name || !form.description}
            >
              {saving ? 'Saving...' : editingBadge ? 'Update Badge' : 'Create Badge'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {ConfirmDialog}
    </div>
  );
}
