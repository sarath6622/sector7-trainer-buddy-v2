'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Check, Dumbbell, Loader2, Plus, Scale, type LucideIcon } from 'lucide-react';
import ProgressLineChart from '@/components/charts/ProgressLineChart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  CHART_RANGES,
  defaultChartRange,
  filterChartRange,
  type ChartRange,
} from '@/lib/chart-range';

export type BodyMetric = 'weight' | 'bodyFat' | 'muscleMass';

interface ChartPoint {
  date: string;
  value: number | null;
}

interface MetricConfig {
  label: string;
  unit: string;
  icon: LucideIcon;
  iconTile: string;
  color: string;
  fieldKey: string;
  placeholder: string;
}

const METRICS: Record<BodyMetric, MetricConfig> = {
  weight: {
    label: 'Weight',
    unit: 'kg',
    icon: Scale,
    iconTile: 'bg-blue-500/10 text-blue-500',
    color: 'hsl(217 91% 60%)',
    fieldKey: 'weightKg',
    placeholder: 'e.g. 74.5',
  },
  bodyFat: {
    label: 'Body Fat',
    unit: '%',
    icon: Activity,
    iconTile: 'bg-amber-500/10 text-amber-500',
    color: 'hsl(22 100% 55%)',
    fieldKey: 'bodyFatPercent',
    placeholder: 'e.g. 18.2',
  },
  muscleMass: {
    label: 'Muscle Mass',
    unit: 'kg',
    icon: Dumbbell,
    iconTile: 'bg-emerald-500/10 text-emerald-500',
    color: 'hsl(142 71% 45%)',
    fieldKey: 'muscleMass',
    placeholder: 'e.g. 62.0',
  },
};

/**
 * Bottom sheet showing a body metric's trend chart with time-range filters
 * and inline quick-logging. Opened from the dashboard's Fitness Journey cards.
 */
export function MetricDetailSheet({
  metric,
  onClose,
  onLogged,
}: {
  metric: BodyMetric | null;
  onClose: () => void;
  onLogged?: () => void;
}) {
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<ChartRange>('all');
  const [logOpen, setLogOpen] = useState(false);
  const [logValue, setLogValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const cfg = metric ? METRICS[metric] : null;

  const fetchChart = useCallback(async (m: BodyMetric, pickDefaultRange: boolean) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/client/progress/charts?metric=${m}`);
      if (res.ok) {
        const json = await res.json();
        const data: ChartPoint[] = (json.data ?? []).filter((p: ChartPoint) => p.value != null);
        setPoints(data);
        if (pickDefaultRange) setRange(defaultChartRange(data));
      }
    } catch {
      // Chart is non-critical — leave the empty state
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset and load whenever a metric is opened
  useEffect(() => {
    if (!metric) return;
    setPoints([]);
    setLogOpen(false);
    setLogValue('');
    setSaved(false);
    fetchChart(metric, true);
  }, [metric, fetchChart]);

  const filtered = useMemo(() => filterChartRange(points, range), [points, range]);

  async function submitLog() {
    if (!metric || !cfg) return;
    const value = parseFloat(logValue);
    if (isNaN(value) || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/client/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [cfg.fieldKey]: value }),
      });
      if (res.ok) {
        setSaved(true);
        setLogValue('');
        fetchChart(metric, false);
        onLogged?.();
        setTimeout(() => {
          setSaved(false);
          setLogOpen(false);
        }, 1200);
      }
    } catch {
      // Keep the input open so the user can retry
    } finally {
      setSaving(false);
    }
  }

  const Icon = cfg?.icon;

  return (
    <Sheet open={metric != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-lg"
      >
        <SheetHeader className="pb-0">
          <SheetTitle className="flex items-center gap-2.5">
            {cfg && Icon && (
              <span
                className={cn('flex h-8 w-8 items-center justify-center rounded-xl', cfg.iconTile)}
              >
                <Icon className="h-4 w-4" />
              </span>
            )}
            {cfg?.label}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4">
          {/* Range filter pills */}
          <div className="flex gap-1.5">
            {CHART_RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                className={cn(
                  'flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
                  range === r.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/60 text-muted-foreground hover:bg-muted',
                )}
                onClick={() => setRange(r.value)}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Chart */}
          {loading ? (
            <Skeleton className="h-[240px] rounded-2xl" />
          ) : filtered.length === 0 ? (
            <div className="flex h-[240px] flex-col items-center justify-center gap-1 text-center">
              <p className="text-sm text-muted-foreground">No entries in this period</p>
              <p className="text-xs text-muted-foreground/70">
                Try a wider range, or log a measurement below
              </p>
            </div>
          ) : (
            cfg && (
              <ProgressLineChart
                data={filtered}
                color={cfg.color}
                unit={cfg.unit}
                height={240}
                gradientId={`metric-sheet-${metric}`}
              />
            )
          )}

          {/* Quick log */}
          {logOpen && cfg ? (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  placeholder={cfg.placeholder}
                  value={logValue}
                  onChange={(e) => setLogValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitLog()}
                  className="pr-10"
                  autoFocus
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {cfg.unit}
                </span>
              </div>
              <Button
                className="shrink-0 rounded-lg"
                disabled={saving || saved || !logValue}
                onClick={submitLog}
              >
                {saved ? (
                  <Check className="h-4 w-4" />
                ) : saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Save'
                )}
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full rounded-xl"
              onClick={() => setLogOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Log {cfg?.label.toLowerCase()}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
