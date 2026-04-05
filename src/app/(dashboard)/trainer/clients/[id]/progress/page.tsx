'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  TrendingUp,
  Plus,
  ArrowLeft,
  Pencil,
  Ruler,
  Scale,
  Flame,
  CheckCircle2,
  Dumbbell,
  ArrowUpRight,
  ArrowDownRight,
  Heart,
  Zap,
  MoveHorizontal,
  MoveVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ProgressLineChart from '@/components/charts/ProgressLineChart';
import WorkoutProgressionPanel, {
  type ExerciseSummary,
} from '@/components/charts/WorkoutProgressionPanel';
import { BadgeGrid, type EarnedBadge, type LockedBadge } from '@/components/badges/BadgeGrid';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProgressEntry {
  id: string;
  recordedAt: string;
  weightKg: number | null;
  bodyFatPercent: number | null;
  muscleMass: number | null;
  chest: number | null;
  waist: number | null;
  hips: number | null;
  bicepLeft: number | null;
  bicepRight: number | null;
  thighLeft: number | null;
  thighRight: number | null;
  photoUrls: string[];
  notes: string | null;
}

interface ChartPoint {
  date: string;
  value: number | null;
  label?: string;
}

interface QuickLogTarget {
  label: string;
  unit: string;
  fields: { key: string; placeholder: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(val: number | null | undefined, decimals = 1): string {
  if (val == null) return '—';
  return val.toFixed(decimals);
}

const QUICK_LOG_TARGETS: Record<string, QuickLogTarget> = {
  weight: { label: 'Weight', unit: 'kg', fields: [{ key: 'weightKg', placeholder: 'e.g. 74.5' }] },
  bodyFat: {
    label: 'Body Fat %',
    unit: '%',
    fields: [{ key: 'bodyFatPercent', placeholder: 'e.g. 18.2' }],
  },
  muscleMass: {
    label: 'Muscle Mass',
    unit: 'kg',
    fields: [{ key: 'muscleMass', placeholder: 'e.g. 62.0' }],
  },
  chest: { label: 'Chest', unit: 'cm', fields: [{ key: 'chest', placeholder: 'e.g. 96.0' }] },
  waist: { label: 'Waist', unit: 'cm', fields: [{ key: 'waist', placeholder: 'e.g. 82.0' }] },
  hips: { label: 'Hips', unit: 'cm', fields: [{ key: 'hips', placeholder: 'e.g. 94.0' }] },
  bicep: {
    label: 'Bicep',
    unit: 'cm',
    fields: [
      { key: 'bicepLeft', placeholder: 'Left (cm)' },
      { key: 'bicepRight', placeholder: 'Right (cm)' },
    ],
  },
  thigh: {
    label: 'Thigh',
    unit: 'cm',
    fields: [
      { key: 'thighLeft', placeholder: 'Left (cm)' },
      { key: 'thighRight', placeholder: 'Right (cm)' },
    ],
  },
};

function getDelta(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return null;
  return a - b;
}

function DeltaChip({
  diff,
  unit = '',
  lowerIsBetter = false,
}: {
  diff: number | null;
  unit?: string;
  lowerIsBetter?: boolean;
}) {
  if (diff == null || Math.abs(diff) < 0.01)
    return <span className="text-xs text-muted-foreground">No change</span>;
  const positive = lowerIsBetter ? diff < 0 : diff > 0;
  const Icon = diff < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <span
      className={`flex items-center gap-0.5 text-xs font-medium ${positive ? 'text-emerald-500' : 'text-red-500'}`}
    >
      <Icon className="h-3 w-3" />
      {diff > 0 ? '+' : ''}
      {diff.toFixed(1)}
      {unit}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrainerClientProgressPage() {
  const { id: clientProfileId } = useParams<{ id: string }>();
  const router = useRouter();

  const [entries, setEntries] = useState<ProgressEntry[]>([]);
  const [weightChart, setWeightChart] = useState<ChartPoint[]>([]);
  const [bodyFatChart, setBodyFatChart] = useState<ChartPoint[]>([]);
  const [muscleChart, setMuscleChart] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('body');
  const [exercises, setExercises] = useState<ExerciseSummary[]>([]);
  const [exercisesLoaded, setExercisesLoaded] = useState(false);

  const [quickLog, setQuickLog] = useState<{
    targetKey: string;
    values: Record<string, string>;
    saving: boolean;
    saved: boolean;
  } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ProgressEntry | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [editSaving, setEditSaving] = useState(false);

  const [earnedBadges, setEarnedBadges] = useState<EarnedBadge[]>([]);
  const [lockedBadges, setLockedBadges] = useState<LockedBadge[]>([]);
  const [badgesLoaded, setBadgesLoaded] = useState(false);

  const base = `/api/trainer/clients/${clientProfileId}`;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, wRes, bRes, mRes] = await Promise.all([
        fetch(`${base}/progress`),
        fetch(`${base}/progress/charts?metric=weight`),
        fetch(`${base}/progress/charts?metric=bodyFat`),
        fetch(`${base}/progress/charts?metric=muscleMass`).catch(() => null),
      ]);
      if (eRes.ok) {
        const { data } = await eRes.json();
        setEntries(data);
      }
      if (wRes.ok) {
        const { data } = await wRes.json();
        setWeightChart(data);
      }
      if (bRes.ok) {
        const { data } = await bRes.json();
        setBodyFatChart(data);
      }
      if (mRes?.ok) {
        const { data } = await mRes.json();
        setMuscleChart(data);
      }
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeTab === 'workout' && !exercisesLoaded) {
      fetch(`${base}/progress/exercises`)
        .then((r) => r.json())
        .then(({ data }) => {
          setExercises(data ?? []);
          setExercisesLoaded(true);
        })
        .catch(() => setExercisesLoaded(true));
    }
  }, [activeTab, exercisesLoaded, base]);

  useEffect(() => {
    if (activeTab === 'badges' && !badgesLoaded) {
      fetch(`${base}/badges`)
        .then((r) => r.json())
        .then(({ data }) => {
          setEarnedBadges(data?.earned ?? []);
          setLockedBadges(data?.locked ?? []);
          setBadgesLoaded(true);
        })
        .catch(() => setBadgesLoaded(true));
    }
  }, [activeTab, badgesLoaded, base]);

  function openQuickLog(targetKey: string) {
    const target = QUICK_LOG_TARGETS[targetKey]!;
    setQuickLog({
      targetKey,
      values: Object.fromEntries(target.fields.map((f) => [f.key, ''])),
      saving: false,
      saved: false,
    });
  }

  async function submitQuickLog() {
    if (!quickLog) return;
    const target = QUICK_LOG_TARGETS[quickLog.targetKey]!;
    const payload: Record<string, number> = {};
    for (const f of target.fields) {
      const v = parseFloat(quickLog.values[f.key] ?? '');
      if (!isNaN(v)) payload[f.key] = v;
    }
    if (Object.keys(payload).length === 0) return;
    setQuickLog((q) => (q ? { ...q, saving: true } : null));
    const res = await fetch(`${base}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setQuickLog((q) => (q ? { ...q, saving: false, saved: true } : null));
      fetchData();
      setTimeout(() => setQuickLog(null), 1200);
    } else {
      setQuickLog((q) => (q ? { ...q, saving: false } : null));
    }
  }

  function openEdit(entry: ProgressEntry) {
    setEditEntry(entry);
    setEditValues({
      weightKg: entry.weightKg?.toString() ?? '',
      bodyFatPercent: entry.bodyFatPercent?.toString() ?? '',
      muscleMass: entry.muscleMass?.toString() ?? '',
      chest: entry.chest?.toString() ?? '',
      waist: entry.waist?.toString() ?? '',
      hips: entry.hips?.toString() ?? '',
      bicepLeft: entry.bicepLeft?.toString() ?? '',
      bicepRight: entry.bicepRight?.toString() ?? '',
      thighLeft: entry.thighLeft?.toString() ?? '',
      thighRight: entry.thighRight?.toString() ?? '',
      notes: entry.notes ?? '',
    });
    setEditOpen(true);
  }

  async function submitEdit() {
    if (!editEntry) return;
    setEditSaving(true);
    const payload: Record<string, number | string> = {};
    for (const [k, v] of Object.entries(editValues)) {
      if (k === 'notes') {
        if (v) payload.notes = v;
      } else {
        const n = parseFloat(v);
        if (!isNaN(n)) payload[k] = n;
      }
    }
    const res = await fetch(`/api/trainer/progress/${editEntry.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      setEditOpen(false);
      fetchData();
    }
    setEditSaving(false);
  }

  const latest = entries[0];
  const oldest = entries[entries.length - 1];

  // Per-metric latest/previous: each quick-log creates a sparse entry (only one field set),
  // so we must find the most recent entry that actually has a value for each metric.
  type NumericKey =
    | 'weightKg'
    | 'bodyFatPercent'
    | 'muscleMass'
    | 'chest'
    | 'waist'
    | 'hips'
    | 'bicepLeft'
    | 'bicepRight'
    | 'thighLeft'
    | 'thighRight';
  function latestOf(key: NumericKey): number | null {
    return entries.find((e) => e[key] != null)?.[key] ?? null;
  }
  function previousOf(key: NumericKey): number | null {
    const firstIdx = entries.findIndex((e) => e[key] != null);
    if (firstIdx < 0) return null;
    return entries.slice(firstIdx + 1).find((e) => e[key] != null)?.[key] ?? null;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-5 pb-8">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-xl bg-muted" />
          <div className="h-7 w-48 animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/trainer/clients')}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Client Progress</h1>
            <p className="text-xs text-muted-foreground">{entries.length} entries recorded</p>
          </div>
        </div>
      </div>

      {/* Metrics — horizontal scroll strip */}
      <div className="-mx-4 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="flex gap-2 px-4 pb-1">
          {(
            [
              {
                key: 'weight',
                icon: <Scale className="h-3.5 w-3.5 text-blue-500" />,
                iconBg: 'bg-blue-500/10',
                label: 'Weight',
                metricKey: 'weightKg' as NumericKey,
                unit: 'kg',
                lowerIsBetter: true,
              },
              {
                key: 'bodyFat',
                icon: <Flame className="h-3.5 w-3.5 text-orange-500" />,
                iconBg: 'bg-orange-500/10',
                label: 'Body Fat',
                metricKey: 'bodyFatPercent' as NumericKey,
                unit: '%',
                lowerIsBetter: true,
              },
              {
                key: 'muscleMass',
                icon: <Dumbbell className="h-3.5 w-3.5 text-emerald-500" />,
                iconBg: 'bg-emerald-500/10',
                label: 'Muscle',
                metricKey: 'muscleMass' as NumericKey,
                unit: 'kg',
                lowerIsBetter: false,
              },
              {
                key: 'waist',
                icon: <Ruler className="h-3.5 w-3.5 text-violet-500" />,
                iconBg: 'bg-violet-500/10',
                label: 'Waist',
                metricKey: 'waist' as NumericKey,
                unit: 'cm',
                lowerIsBetter: true,
              },
              {
                key: 'chest',
                icon: <Heart className="h-3.5 w-3.5 text-pink-500" />,
                iconBg: 'bg-pink-500/10',
                label: 'Chest',
                metricKey: 'chest' as NumericKey,
                unit: 'cm',
                lowerIsBetter: false,
              },
              {
                key: 'hips',
                icon: <MoveHorizontal className="h-3.5 w-3.5 text-amber-500" />,
                iconBg: 'bg-amber-500/10',
                label: 'Hips',
                metricKey: 'hips' as NumericKey,
                unit: 'cm',
                lowerIsBetter: false,
              },
              {
                key: 'bicep',
                icon: <Zap className="h-3.5 w-3.5 text-cyan-500" />,
                iconBg: 'bg-cyan-500/10',
                label: 'Bicep',
                metricKey: 'bicepLeft' as NumericKey,
                unit: 'cm',
                lowerIsBetter: false,
                paired: 'bicepRight' as NumericKey,
              },
              {
                key: 'thigh',
                icon: <MoveVertical className="h-3.5 w-3.5 text-indigo-500" />,
                iconBg: 'bg-indigo-500/10',
                label: 'Thigh',
                metricKey: 'thighLeft' as NumericKey,
                unit: 'cm',
                lowerIsBetter: false,
                paired: 'thighRight' as NumericKey,
              },
            ] as Array<{
              key: string;
              icon: React.ReactNode;
              iconBg: string;
              label: string;
              metricKey: NumericKey;
              unit: string;
              lowerIsBetter: boolean;
              paired?: NumericKey;
            }>
          ).map((tile) => {
            const val = latestOf(tile.metricKey);
            const paired = tile.paired ? latestOf(tile.paired) : null;
            const displayValue =
              val != null ? (tile.paired ? `${fmt(val)}/${fmt(paired)}` : fmt(val)) : '—';
            const delta = getDelta(val, previousOf(tile.metricKey));
            return (
              <MetricChip
                key={tile.key}
                icon={tile.icon}
                iconBg={tile.iconBg}
                label={tile.label}
                value={displayValue}
                unit={tile.unit}
                delta={delta}
                deltaUnit={tile.unit}
                lowerIsBetter={tile.lowerIsBetter}
                hasData={val != null}
                onLog={() => openQuickLog(tile.key)}
              />
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger
            value="body"
            className="flex-1 text-xs focus-visible:ring-0 focus-visible:outline-none"
          >
            Body Metrics
          </TabsTrigger>
          <TabsTrigger
            value="workout"
            className="flex-1 text-xs focus-visible:ring-0 focus-visible:outline-none"
          >
            <Dumbbell className="mr-1 h-3 w-3" />
            Workouts
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="flex-1 text-xs focus-visible:ring-0 focus-visible:outline-none"
          >
            History
          </TabsTrigger>
          <TabsTrigger
            value="badges"
            className="flex-1 text-xs focus-visible:ring-0 focus-visible:outline-none"
          >
            Badges
          </TabsTrigger>
        </TabsList>

        {/* ── Body Metrics tab ── */}
        <TabsContent value="body" className="mt-4 space-y-3">
          {weightChart.length > 0 && (
            <ChartCard
              title="WEIGHT"
              unit="kg"
              color="hsl(217 91% 60%)"
              gradientId="grad-w"
              data={weightChart}
              onAdd={() => openQuickLog('weight')}
            />
          )}
          {bodyFatChart.length > 0 && (
            <ChartCard
              title="BODY FAT %"
              unit="%"
              color="hsl(22 100% 55%)"
              gradientId="grad-bf"
              data={bodyFatChart}
              onAdd={() => openQuickLog('bodyFat')}
            />
          )}
          {muscleChart.length > 0 && (
            <ChartCard
              title="MUSCLE MASS"
              unit="kg"
              color="hsl(142 71% 45%)"
              gradientId="grad-mm"
              data={muscleChart}
              onAdd={() => openQuickLog('muscleMass')}
            />
          )}

          {/* Measurements row */}
          {entries.length >= 2 && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Circumference Measurements
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(['chest', 'waist', 'hips'] as const).map((field) => {
                  const cur = latest?.[field];
                  const old = oldest?.[field];
                  if (cur == null) return null;
                  return (
                    <MiniMetricCard
                      key={field}
                      label={field.charAt(0).toUpperCase() + field.slice(1)}
                      value={fmt(cur)}
                      unit="cm"
                      delta={getDelta(cur, old)}
                      lowerIsBetter
                      onLog={() => openQuickLog(field)}
                    />
                  );
                })}
                {latest?.bicepLeft != null && (
                  <MiniMetricCard
                    label="Bicep L/R"
                    value={`${fmt(latest.bicepLeft)}/${fmt(latest.bicepRight)}`}
                    unit="cm"
                    delta={null}
                    onLog={() => openQuickLog('bicep')}
                  />
                )}
                {latest?.thighLeft != null && (
                  <MiniMetricCard
                    label="Thigh L/R"
                    value={`${fmt(latest.thighLeft)}/${fmt(latest.thighRight)}`}
                    unit="cm"
                    delta={null}
                    onLog={() => openQuickLog('thigh')}
                  />
                )}
              </div>
            </div>
          )}

          {weightChart.length === 0 && bodyFatChart.length === 0 && (
            <EmptyState label="No body metric data yet" onLog={() => openQuickLog('weight')} />
          )}
        </TabsContent>

        {/* ── Workout Progression tab ── */}
        <TabsContent value="workout" className="mt-4">
          {!exercisesLoaded ? (
            <div className="space-y-3">
              <div className="h-11 w-3/4 animate-pulse rounded-xl bg-muted" />
              <div className="h-56 animate-pulse rounded-2xl bg-muted" />
            </div>
          ) : (
            <WorkoutProgressionPanel
              exercises={exercises}
              chartEndpoint={`${base}/progress/charts`}
            />
          )}
        </TabsContent>

        {/* ── History tab ── */}
        <TabsContent value="history" className="mt-4 space-y-2">
          {entries.length === 0 ? (
            <EmptyState label="No progress entries yet" onLog={() => openQuickLog('weight')} />
          ) : (
            entries.map((entry, i) => (
              <HistoryCard
                key={entry.id}
                entry={entry}
                isLatest={i === 0}
                onEdit={() => openEdit(entry)}
              />
            ))
          )}
        </TabsContent>

        {/* ── Badges tab ── */}
        <TabsContent value="badges" className="mt-4">
          {!badgesLoaded ? (
            <div className="h-24 animate-pulse rounded-xl bg-muted" />
          ) : (
            <BadgeGrid earned={earnedBadges} locked={lockedBadges} />
          )}
        </TabsContent>
      </Tabs>

      {/* ── Quick Log Dialog ── */}
      {quickLog &&
        (() => {
          const target = QUICK_LOG_TARGETS[quickLog.targetKey]!;
          return (
            <Dialog open onOpenChange={() => setQuickLog(null)}>
              <DialogContent className="max-w-xs">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <Plus className="h-4 w-4 text-primary" />
                    Log {target.label}
                  </DialogTitle>
                  <DialogDescription className="text-xs">
                    Enter today&apos;s {target.label.toLowerCase()} measurement in {target.unit}.
                  </DialogDescription>
                </DialogHeader>
                {quickLog.saved ? (
                  <div className="flex flex-col items-center gap-2 py-6">
                    <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                    <p className="text-sm font-medium text-emerald-500">Saved!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {target.fields.map((f) => (
                      <QuickInput
                        key={f.key}
                        placeholder={f.placeholder}
                        unit={target.unit}
                        value={quickLog.values[f.key] ?? ''}
                        onChange={(v) =>
                          setQuickLog((q) =>
                            q ? { ...q, values: { ...q.values, [f.key]: v } } : null,
                          )
                        }
                        onEnter={submitQuickLog}
                      />
                    ))}
                    <Button
                      className="w-full mt-1"
                      onClick={submitQuickLog}
                      disabled={
                        quickLog.saving || target.fields.every((f) => !quickLog.values[f.key])
                      }
                    >
                      {quickLog.saving ? 'Saving…' : `Save ${target.label}`}
                    </Button>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          );
        })()}

      {/* ── Full Edit Dialog ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
            <DialogDescription>
              {editEntry
                ? new Date(editEntry.recordedAt).toLocaleDateString('en-IN', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {(
              [
                ['weightKg', 'Weight (kg)'],
                ['bodyFatPercent', 'Body Fat (%)'],
                ['muscleMass', 'Muscle Mass (kg)'],
                ['chest', 'Chest (cm)'],
                ['waist', 'Waist (cm)'],
                ['hips', 'Hips (cm)'],
                ['bicepLeft', 'Bicep Left (cm)'],
                ['bicepRight', 'Bicep Right (cm)'],
                ['thighLeft', 'Thigh Left (cm)'],
                ['thighRight', 'Thigh Right (cm)'],
              ] as [string, string][]
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{label}</p>
                <Input
                  type="number"
                  step="0.1"
                  value={editValues[key] ?? ''}
                  onChange={(e) => setEditValues((v) => ({ ...v, [key]: e.target.value }))}
                />
              </div>
            ))}
            <div className="col-span-2 space-y-1.5">
              <p className="text-xs text-muted-foreground">Notes</p>
              <Input
                value={editValues.notes ?? ''}
                onChange={(e) => setEditValues((v) => ({ ...v, notes: e.target.value }))}
                placeholder="Optional notes…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitEdit} disabled={editSaving}>
              {editSaving ? 'Saving…' : 'Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricChip({
  icon,
  iconBg,
  label,
  value,
  unit,
  delta,
  deltaUnit,
  lowerIsBetter = false,
  hasData,
  onLog,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  unit: string;
  delta: number | null;
  deltaUnit: string;
  lowerIsBetter?: boolean;
  hasData: boolean;
  onLog: () => void;
}) {
  return (
    <div className="w-[128px] shrink-0 rounded-2xl bg-card p-3 ring-1 ring-border/50">
      <div className="flex items-center justify-between">
        <div className={`flex h-7 w-7 items-center justify-center rounded-xl ${iconBg}`}>
          {icon}
        </div>
        <button
          onClick={onLog}
          className="flex items-center gap-0.5 text-[10px] font-medium text-primary hover:opacity-80"
        >
          <Plus className="h-3 w-3" />
          Log
        </button>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-bold leading-none ${value.includes('/') ? 'text-sm' : 'text-lg'}`}>
        {value}
        {value !== '—' && (
          <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">{unit}</span>
        )}
      </p>
      <div className="mt-1">
        {!hasData ? (
          <span className="text-[9px] text-muted-foreground">Tap + Log to start</span>
        ) : (
          <DeltaChip diff={delta} unit={deltaUnit} lowerIsBetter={lowerIsBetter} />
        )}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  unit,
  color,
  gradientId,
  data,
  onAdd,
}: {
  title: string;
  unit: string;
  color: string;
  gradientId: string;
  data: ChartPoint[];
  onAdd: () => void;
}) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <button
          onClick={onAdd}
          className="flex items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium text-primary hover:bg-primary/10"
        >
          <Plus className="h-3 w-3" /> Log
        </button>
      </div>
      <ProgressLineChart
        data={data}
        unit={unit}
        color={color}
        height={160}
        gradientId={gradientId}
      />
    </div>
  );
}

function MiniMetricCard({
  label,
  value,
  unit,
  delta,
  lowerIsBetter = false,
  onLog,
}: {
  label: string;
  value: string;
  unit: string;
  delta: number | null;
  lowerIsBetter?: boolean;
  onLog: () => void;
}) {
  return (
    <div className="rounded-2xl bg-card p-3 ring-1 ring-border/50">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <button onClick={onLog} className="text-[10px] text-primary hover:opacity-80">
          <Plus className="h-3 w-3" />
        </button>
      </div>
      <p className="mt-1 text-base font-bold">
        {value}
        <span className="ml-0.5 text-xs font-normal text-muted-foreground"> {unit}</span>
      </p>
      <DeltaChip diff={delta} unit={unit} lowerIsBetter={lowerIsBetter} />
    </div>
  );
}

function HistoryCard({
  entry,
  isLatest,
  onEdit,
}: {
  entry: ProgressEntry;
  isLatest: boolean;
  onEdit: () => void;
}) {
  const date = new Date(entry.recordedAt);
  const day = date.getDate();
  const month = date.toLocaleDateString('en-IN', { month: 'short' });
  const year = date.getFullYear();

  const metrics: { label: string; value: string }[] = [];
  if (entry.weightKg != null) metrics.push({ label: 'Weight', value: `${fmt(entry.weightKg)} kg` });
  if (entry.bodyFatPercent != null)
    metrics.push({ label: 'Body Fat', value: `${fmt(entry.bodyFatPercent)}%` });
  if (entry.muscleMass != null)
    metrics.push({ label: 'Muscle', value: `${fmt(entry.muscleMass)} kg` });
  if (entry.chest != null) metrics.push({ label: 'Chest', value: `${fmt(entry.chest)} cm` });
  if (entry.waist != null) metrics.push({ label: 'Waist', value: `${fmt(entry.waist)} cm` });
  if (entry.hips != null) metrics.push({ label: 'Hips', value: `${fmt(entry.hips)} cm` });
  if (entry.bicepLeft != null)
    metrics.push({
      label: 'Bicep L/R',
      value: `${fmt(entry.bicepLeft)}/${fmt(entry.bicepRight)} cm`,
    });
  if (entry.thighLeft != null)
    metrics.push({
      label: 'Thigh L/R',
      value: `${fmt(entry.thighLeft)}/${fmt(entry.thighRight)} cm`,
    });

  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10">
          <span className="text-base font-bold leading-none text-primary">{day}</span>
          <span className="text-[9px] font-medium uppercase text-primary/70">{month}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">
              {month} {day}, {year}
            </p>
            {isLatest && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-semibold text-primary">
                LATEST
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{metrics.length} measurements</p>
        </div>
        <button
          onClick={onEdit}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      {metrics.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2 border-t border-border/50 pt-3">
          {metrics.map((m) => (
            <div key={m.label}>
              <p className="text-[10px] text-muted-foreground">{m.label}</p>
              <p className="text-sm font-semibold">{m.value}</p>
            </div>
          ))}
        </div>
      )}
      {entry.notes && <p className="mt-2 text-xs text-muted-foreground italic">{entry.notes}</p>}
    </div>
  );
}

function EmptyState({ label, onLog }: { label: string; onLog: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/50 py-16 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <TrendingUp className="h-7 w-7 text-muted-foreground" />
      </div>
      <div>
        <p className="font-medium">{label}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap below to record the first measurement
        </p>
      </div>
      <button
        onClick={onLog}
        className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> Log Measurement
      </button>
    </div>
  );
}

function QuickInput({
  placeholder,
  unit,
  value,
  onChange,
  onEnter,
}: {
  placeholder: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="relative">
      <Input
        ref={ref}
        type="number"
        step="0.1"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter();
        }}
        className="pr-12 text-base h-12"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground pointer-events-none">
        {unit}
      </span>
    </div>
  );
}
