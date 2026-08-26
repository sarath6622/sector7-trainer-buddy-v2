'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Flame, Ruler, Scale, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface WeighInNudgeData {
  shouldPrompt: boolean;
  reason: 'NEVER_LOGGED' | 'STALE' | null;
  thresholdDays: number;
  daysSinceLastWeighIn: number | null;
  lastWeighIn: { weightKg: number; recordedAt: string } | null;
  firstWeighIn: { weightKg: number; recordedAt: string } | null;
  totalChangeKg: number | null;
  entryCount: number;
  trackedDays: number | null;
  series: { date: string; value: number }[];
}

interface Props {
  data: WeighInNudgeData;
  /** Supporting stats, purely for motivation — all optional. */
  streak?: number;
  allTimeCompleted?: number;
  topPr?: { exerciseName: string; maxWeightKg: number } | null;
  /** Called when the client closes without logging (triggers the snooze). */
  onDismiss: () => void;
  /** Called after a weight is saved, so the dashboard can refetch. */
  onLogged: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' });
}

function formatMonths(days: number): string {
  if (days < 45) return `${days} days`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} months`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem === 0 ? `${years} year${years > 1 ? 's' : ''}` : `${years}y ${rem}m`;
}

/**
 * Sparkline of past weigh-ins, with the current silence rendered as a dashed
 * run out to "today". The empty stretch is the point of the chart — it shows
 * the client the line they've stopped drawing.
 */
function WeightSparkline({
  series,
  daysSinceLastWeighIn,
}: {
  series: { date: string; value: number }[];
  daysSinceLastWeighIn: number | null;
}) {
  const W = 280;
  const H = 64;
  const PAD = 6;

  const path = useMemo(() => {
    if (series.length < 2) return null;
    const times = series.map((p) => new Date(p.date).getTime());
    const values = series.map((p) => p.value);
    const tMin = times[0] ?? 0;
    const tLast = times[times.length - 1] ?? tMin;
    // Extend the x-domain to "now" so the gap since the last weigh-in is
    // physically visible rather than compressed away at the right edge. "Now" is
    // derived from the server's day count rather than the browser clock — it
    // keeps this render pure and immune to device clock skew.
    const nowMs = tLast + (daysSinceLastWeighIn ?? 0) * 86_400_000;
    const tMax = Math.max(tLast, nowMs);
    const tSpan = tMax - tMin || 1;
    const vMin = Math.min(...values);
    const vMax = Math.max(...values);
    const vSpan = vMax - vMin || 1;

    const x = (t: number) => PAD + ((t - tMin) / tSpan) * (W - PAD * 2);
    const y = (v: number) => H - PAD - ((v - vMin) / vSpan) * (H - PAD * 2);

    const points = series.map((p, i) => ({ x: x(times[i] ?? tMin), y: y(p.value) }));
    const head = points[0];
    const last = points[points.length - 1];
    if (!head || !last) return null;

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const nowX = x(nowMs);

    return {
      line,
      last,
      nowX,
      // Only draw the dashed tail when there's a visible stretch of silence.
      showGap: nowX - last.x > 8,
      area: `${line} L${last.x},${H} L${head.x},${H} Z`,
    };
  }, [series, daysSinceLastWeighIn]);

  if (!path) return null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-16 w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="weighInFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="hsl(217 91% 60%)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={path.area} fill="url(#weighInFill)" />
      <path
        d={path.line}
        fill="none"
        stroke="hsl(217 91% 60%)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {path.showGap && (
        <>
          <path
            d={`M${path.last.x},${path.last.y} L${path.nowX},${path.last.y}`}
            fill="none"
            stroke="currentColor"
            className="text-muted-foreground/40"
            strokeWidth="2"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={path.nowX} cy={path.last.y} r="3" className="fill-muted-foreground/40" />
        </>
      )}
      <circle cx={path.last.x} cy={path.last.y} r="3.5" fill="hsl(217 91% 60%)" />
      {daysSinceLastWeighIn != null && path.showGap && (
        <text
          x={(path.last.x + path.nowX) / 2}
          y={path.last.y - 8}
          textAnchor="middle"
          className="fill-muted-foreground text-[9px]"
        >
          {daysSinceLastWeighIn}d
        </text>
      )}
    </svg>
  );
}

function StatChip({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Flame;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-muted/50 px-2 py-2.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-sm font-bold leading-none">{value}</span>
      <span className="text-[10px] leading-none text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * Dismissible prompt shown on the client dashboard when a weigh-in is overdue.
 *
 * The pitch is progression, not nagging: it leads with how far the client has
 * already come, shows the gap they've left in their own chart, and lets them
 * close the loop with a single number typed inline — no navigation required.
 */
export function WeighInNudge({
  data,
  streak,
  allTimeCompleted,
  topPr,
  onDismiss,
  onLogged,
}: Props) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedWeight, setSavedWeight] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isFirstEver = data.reason === 'NEVER_LOGGED';
  const change = data.totalChangeKg;
  const hasJourney = change != null && data.firstWeighIn != null;
  const lost = change != null && change < 0;

  async function submit() {
    const parsed = parseFloat(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/client/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weightKg: parsed }),
      });
      if (!res.ok) {
        setError('Could not save. Try again.');
        return;
      }
      setSavedWeight(parsed);
      onLogged();
    } catch {
      setError('Could not save. Check your connection.');
    } finally {
      setSaving(false);
    }
  }

  // ── Saved state: pay the client back immediately with their new number ──
  if (savedWeight != null) {
    const baseline = data.firstWeighIn?.weightKg ?? null;
    const newChange = baseline != null ? Math.round((savedWeight - baseline) * 10) / 10 : null;

    return (
      <Dialog open onOpenChange={onDismiss}>
        <DialogContent className="max-w-sm" showCloseButton={false}>
          <DialogTitle className="sr-only">Weight logged</DialogTitle>
          <DialogDescription className="sr-only">
            Your weight has been saved to your progress history.
          </DialogDescription>
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
              <Check className="h-7 w-7 text-emerald-500" />
            </span>
            <div>
              <p className="text-2xl font-bold">{savedWeight} kg</p>
              <p className="mt-0.5 text-sm text-muted-foreground">Logged for today</p>
            </div>
            {newChange != null && newChange !== 0 && data.firstWeighIn && (
              <p className="text-sm font-medium">
                That&apos;s{' '}
                <span className={newChange < 0 ? 'text-emerald-500' : 'text-blue-500'}>
                  {newChange < 0 ? '−' : '+'}
                  {Math.abs(newChange)} kg
                </span>{' '}
                since {formatDate(data.firstWeighIn.recordedAt)}.
              </p>
            )}
            <Button className="mt-1 w-full" onClick={onDismiss}>
              Done
            </Button>
            <Link
              href="/client/progress"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={onDismiss}
            >
              See the full chart
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Prompt state ──
  return (
    <Dialog open onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="max-w-sm">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start gap-3 pr-6">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
              <Scale className="h-5 w-5 text-blue-500" />
            </span>
            <div>
              <DialogTitle className="text-base leading-snug">
                {isFirstEver
                  ? 'Set your starting point'
                  : data.daysSinceLastWeighIn != null &&
                      `It's been ${formatMonths(data.daysSinceLastWeighIn)}`}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs leading-relaxed">
                {isFirstEver
                  ? 'Every result you get from here is measured against your first number. It takes ten seconds.'
                  : 'Your chart is waiting on you. One number keeps the whole picture honest.'}
              </DialogDescription>
            </div>
          </div>

          {/* Progression hero — the actual reason to care */}
          {hasJourney && data.firstWeighIn && data.lastWeighIn && (
            <div className="rounded-2xl border bg-card p-3.5">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Since {formatDate(data.firstWeighIn.recordedAt)}
                  </p>
                  <p
                    className={cn(
                      'mt-0.5 text-3xl font-bold leading-none',
                      change === 0
                        ? 'text-foreground'
                        : lost
                          ? 'text-emerald-500'
                          : 'text-blue-500',
                    )}
                  >
                    {change === 0 ? 'Holding' : `${lost ? '−' : '+'}${Math.abs(change)} kg`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">
                    {data.firstWeighIn.weightKg} → {data.lastWeighIn.weightKg} kg
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {data.entryCount} weigh-ins
                    {data.trackedDays != null && ` · ${formatMonths(data.trackedDays)}`}
                  </p>
                </div>
              </div>

              <div className="mt-2 text-blue-500">
                <WeightSparkline
                  series={data.series}
                  daysSinceLastWeighIn={data.daysSinceLastWeighIn}
                />
              </div>
            </div>
          )}

          {/* Supporting stats — proof the work is happening even if the log isn't */}
          {(streak || allTimeCompleted || topPr) && (
            <div className="flex gap-2">
              {allTimeCompleted != null && allTimeCompleted > 0 && (
                <StatChip icon={Flame} value={String(allTimeCompleted)} label="sessions" />
              )}
              {streak != null && streak > 0 && (
                <StatChip icon={Ruler} value={String(streak)} label="streak" />
              )}
              {topPr && (
                <StatChip
                  icon={Trophy}
                  value={`${topPr.maxWeightKg}kg`}
                  label={(topPr.exerciseName.split(' ')[0] ?? 'best').toLowerCase()}
                />
              )}
            </div>
          )}

          {/* Inline log — the whole ask is one field */}
          <div className="space-y-2">
            <div className="relative">
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                autoFocus
                placeholder={
                  data.lastWeighIn ? `Last: ${data.lastWeighIn.weightKg}` : 'e.g. 74.5'
                }
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                className="h-12 pr-12 text-lg font-semibold"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                kg
              </span>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button
              className="h-11 w-full"
              onClick={submit}
              disabled={saving || !Number.isFinite(parseFloat(value))}
            >
              {saving ? 'Saving…' : 'Log my weight'}
            </Button>
          </div>

          {/* Escape hatches */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onDismiss}
              className="h-10 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Not now
            </button>
            <Link
              href="/client/progress"
              onClick={onDismiss}
              className="flex h-10 items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              Log body fat &amp; measurements <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
