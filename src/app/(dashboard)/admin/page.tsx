'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import {
  AlertCircle,
  BarChart3,
  Calendar,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  FileText,
  Layers,
  RefreshCw,
  Settings,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
  AlertTriangle,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar as CalendarUI } from '@/components/ui/calendar';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList,
} from 'recharts';

// ─── Time Range ───────────────────────────────────────────────────────────────

type PresetKey = 'today' | '7d' | 'month' | 'last-month';
type TimeRangeKey = PresetKey | 'custom';

interface DateRange {
  start: Date;
  end: Date;
}

function buildPresets(): Record<PresetKey, { label: string; range: DateRange; subLabel: string }> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const last7Start = new Date(todayStart);
  last7Start.setDate(last7Start.getDate() - 6);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  return {
    today: { label: 'Today', range: { start: todayStart, end: todayEnd }, subLabel: 'today' },
    '7d': { label: '7 Days', range: { start: last7Start, end: todayEnd }, subLabel: 'last 7 days' },
    month: {
      label: 'This Month',
      range: { start: monthStart, end: monthEnd },
      subLabel: 'this month',
    },
    'last-month': {
      label: 'Last Month',
      range: { start: lastMonthStart, end: lastMonthEnd },
      subLabel: 'last month',
    },
  };
}

const PRESET_KEYS: PresetKey[] = ['today', '7d', 'month', 'last-month'];

function fmtShort(d: Date) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

function dateRangeToParams(range: DateRange) {
  return `startDate=${range.start.toISOString()}&endDate=${range.end.toISOString()}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TrainerUtilization {
  trainerName: string;
  totalSessions: number;
  completedSessions: number;
  utilizationPercent: number;
}

interface SessionConsumption {
  clientName: string;
  sessionsPerMonth: number;
  completed: number;
  noShow: number;
  scheduled: number;
  cancelled: number;
  carryForward: number;
  consumptionPercent: number;
}

interface NoShowRate {
  trainerName: string;
  totalSessions: number;
  noShowCount: number;
  noShowPercent: number;
}

interface DashboardAnalytics {
  utilization: TrainerUtilization[];
  consumption: SessionConsumption[];
  noShow: NoShowRate[];
}

interface ExpiringPackage {
  packageId: string;
  clientName: string;
  clientEmail: string;
  trainerName: string;
  endDate: string;
  daysLeft: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { label: 'Clients', href: '/admin/clients', icon: Users },
  { label: 'Trainers', href: '/admin/trainers', icon: UserCheck },
  { label: 'Scheduling', href: '/admin/scheduling', icon: Calendar },
  { label: 'Leaves', href: '/admin/leaves', icon: CalendarDays },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { label: 'Audit Log', href: '/admin/audit-log', icon: FileText },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { data: session } = useSession();
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [expiringPackages, setExpiringPackages] = useState<ExpiringPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeRange, setActiveRange] = useState<TimeRangeKey>('month');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<DayPickerRange | undefined>();
  const pickerRef = useRef<HTMLDivElement>(null);

  // close picker on outside click
  useEffect(() => {
    if (!showCustomPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowCustomPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCustomPicker]);

  const fetchWithRange = useCallback(async (range: DateRange) => {
    setLoading(true);
    setError(false);
    try {
      const base = `/api/admin/analytics?${dateRangeToParams(range)}`;
      const [u, c, n, expiring] = await Promise.all([
        fetch(`${base}&report=trainer-utilization`).then((res) => res.json()),
        fetch(`${base}&report=session-consumption`).then((res) => res.json()),
        fetch(`${base}&report=no-show-rate`).then((res) => res.json()),
        fetch('/api/admin/clients/expiring?days=10').then((res) => res.json()),
      ]);
      setAnalytics({
        utilization: u.data ?? [],
        consumption: c.data ?? [],
        noShow: n.data ?? [],
      });
      setExpiringPackages(expiring.data ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePresetChange = (key: PresetKey) => {
    setActiveRange(key);
    setShowCustomPicker(false);
    const preset = buildPresets()[key];
    fetchWithRange(preset.range);
  };

  const handleCustomApply = () => {
    if (!pickerSelection?.from) return;
    const start = new Date(pickerSelection.from);
    start.setHours(0, 0, 0, 0);
    const end = pickerSelection.to ? new Date(pickerSelection.to) : new Date(start);
    end.setHours(23, 59, 59, 999);
    const range: DateRange = { start, end };
    setCustomRange(range);
    setActiveRange('custom');
    setShowCustomPicker(false);
    fetchWithRange(range);
  };

  const handleRefresh = () => {
    if (activeRange === 'custom' && customRange) {
      fetchWithRange(customRange);
    } else if (activeRange !== 'custom') {
      fetchWithRange(buildPresets()[activeRange].range);
    }
  };

  const clearCustomRange = () => {
    setCustomRange(null);
    setActiveRange('month');
    setShowCustomPicker(false);
    fetchWithRange(buildPresets()['month'].range);
  };

  useEffect(() => {
    fetchWithRange(buildPresets()['month'].range);
  }, [fetchWithRange]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-8">
        <div className="flex items-start justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <Skeleton className="lg:col-span-3 h-64 rounded-2xl" />
          <div className="lg:col-span-2 grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">Could not load dashboard data.</p>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      </div>
    );
  }

  const { utilization, consumption, noShow } = analytics;

  const activeClients = consumption.length;
  const totalScheduled = consumption.reduce(
    (s, c) => s + c.scheduled + c.completed + c.noShow + c.cancelled,
    0,
  );
  const totalCompleted = consumption.reduce((s, c) => s + c.completed, 0);
  const totalRemaining = consumption.reduce((s, c) => s + c.scheduled, 0);
  const totalNoShows = noShow.reduce((s, n) => s + n.noShowCount, 0);
  const avgCompletion =
    utilization.length > 0
      ? Math.round(utilization.reduce((s, u) => s + u.utilizationPercent, 0) / utilization.length)
      : null;

  const chartData = [...utilization]
    .sort((a, b) => b.utilizationPercent - a.utilizationPercent)
    .map((t) => ({
      name: t.trainerName.split(' ')[0] ?? t.trainerName,
      value: t.utilizationPercent,
    }));

  const presets = buildPresets();
  const subLabel =
    activeRange === 'custom' && customRange
      ? `${fmtShort(customRange.start)} – ${fmtShort(customRange.end)}`
      : activeRange !== 'custom'
        ? presets[activeRange].subLabel
        : 'custom range';

  const activityTitle = activeRange === 'custom' ? 'Custom Range' : presets[activeRange].label;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{getGreeting()}</p>
          <h1 className="text-3xl font-bold tracking-tight">
            {session?.user?.firstName ?? 'Admin'}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            {' · '}
            {subLabel} overview
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Refresh dashboard"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Time Range Picker ── */}
      <div
        ref={pickerRef}
        className="relative flex items-center gap-1 rounded-xl bg-muted/40 p-1 ring-1 ring-border/40 w-fit"
      >
        {/* Preset pills — dim when custom is active */}
        {PRESET_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => handlePresetChange(key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              activeRange === key
                ? 'bg-card text-foreground shadow-sm ring-1 ring-border/50'
                : activeRange === 'custom'
                  ? 'text-muted-foreground/40 hover:text-muted-foreground'
                  : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {presets[key].label}
          </button>
        ))}

        {/* Divider */}
        <div className="w-px h-4 bg-border/50 mx-0.5 shrink-0" />

        {/* Custom control — icon only when inactive, label + × when active */}
        {activeRange === 'custom' && customRange ? (
          <div className="flex items-center gap-1 rounded-lg bg-card px-2.5 py-1.5 ring-1 ring-border/50 shadow-sm">
            <CalendarRange className="h-3 w-3 text-muted-foreground shrink-0" />
            <button
              onClick={() => {
                setShowCustomPicker((v) => !v);
                if (!showCustomPicker) setPickerSelection(undefined);
              }}
              className="text-xs font-medium text-foreground whitespace-nowrap"
            >
              {fmtShort(customRange.start)} – {fmtShort(customRange.end)}
            </button>
            <button
              onClick={clearCustomRange}
              className="ml-0.5 rounded p-0.5 hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear custom range"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setShowCustomPicker((v) => !v);
              if (!showCustomPicker) setPickerSelection(undefined);
            }}
            className={cn(
              'flex items-center justify-center rounded-lg p-1.5 transition-all',
              showCustomPicker
                ? 'bg-card text-foreground shadow-sm ring-1 ring-border/50'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-label="Pick custom date range"
          >
            <CalendarRange className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Floating calendar dropdown */}
        {showCustomPicker && (
          <div className="absolute left-0 top-full mt-2 z-50 rounded-2xl bg-card ring-1 ring-border/60 shadow-xl overflow-hidden">
            <div className="px-4 pt-3 pb-1 border-b border-border/40">
              <p className="text-xs font-medium text-muted-foreground">Select date range</p>
              {pickerSelection?.from && (
                <p className="text-xs text-foreground mt-0.5">
                  {fmtShort(pickerSelection.from)}
                  {pickerSelection.to && pickerSelection.to !== pickerSelection.from && (
                    <>
                      <ChevronRight className="inline h-3 w-3 mx-0.5 text-muted-foreground" />
                      {fmtShort(pickerSelection.to)}
                    </>
                  )}
                </p>
              )}
            </div>
            <CalendarUI
              mode="range"
              selected={pickerSelection}
              onSelect={setPickerSelection}
              disabled={{ after: new Date() }}
              numberOfMonths={1}
            />
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/40">
              <button
                onClick={() => setShowCustomPicker(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCustomApply}
                disabled={!pickerSelection?.from}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40 transition-opacity"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Active Clients"
          value={activeClients}
          sub={`with sessions ${subLabel}`}
          color="text-blue-500"
          bg="bg-blue-500/10"
        />
        <KpiCard
          icon={<Layers className="h-4 w-4" />}
          label="Total Sessions"
          value={totalScheduled}
          sub={`${totalCompleted} completed`}
          color="text-violet-500"
          bg="bg-violet-500/10"
          progress={totalScheduled > 0 ? (totalCompleted / totalScheduled) * 100 : 0}
          progressColor="bg-violet-500"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Avg Completion"
          value={avgCompletion != null ? `${avgCompletion}%` : '—'}
          sub={`${utilization.length} trainer${utilization.length !== 1 ? 's' : ''}`}
          color="text-emerald-500"
          bg="bg-emerald-500/10"
          progress={avgCompletion ?? 0}
          progressColor={
            (avgCompletion ?? 0) >= 70
              ? 'bg-emerald-500'
              : (avgCompletion ?? 0) >= 40
                ? 'bg-amber-500'
                : 'bg-red-500'
          }
        />
        <KpiCard
          icon={<UserX className="h-4 w-4" />}
          label="No-Shows"
          value={totalNoShows}
          sub={subLabel}
          color={totalNoShows > 0 ? 'text-red-500' : 'text-muted-foreground'}
          bg={totalNoShows > 0 ? 'bg-red-500/10' : 'bg-muted/60'}
        />
      </div>

      {/* ── Middle row: Activity + Quick Nav ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Monthly Activity */}
        <div className="lg:col-span-3 rounded-2xl bg-card ring-1 ring-border/50 flex flex-col">
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/40">
            <h2 className="text-sm font-semibold">{activityTitle} Activity</h2>
            <Link href="/admin/scheduling" className="text-xs text-primary hover:underline">
              View scheduling →
            </Link>
          </div>
          <div className="flex-1 px-5 py-5 space-y-5">
            <ActivityBar
              label="Total Sessions"
              value={totalScheduled}
              max={totalScheduled}
              color="bg-blue-500"
              textColor="text-blue-400"
            />
            <ActivityBar
              label="Completed"
              value={totalCompleted}
              max={totalScheduled}
              color="bg-emerald-500"
              textColor="text-emerald-400"
            />
            <ActivityBar
              label="Remaining"
              value={totalRemaining}
              max={totalScheduled}
              color="bg-amber-500"
              textColor="text-amber-400"
            />
            <ActivityBar
              label="No-Shows"
              value={totalNoShows}
              max={totalScheduled}
              color="bg-red-500"
              textColor="text-red-400"
            />
          </div>
        </div>

        {/* Quick Nav icon grid */}
        <div className="lg:col-span-2 grid grid-cols-4 gap-2 content-start">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex flex-col items-center gap-2 rounded-xl bg-card ring-1 ring-border/50 px-2 py-4 text-center transition-all hover:bg-muted/30 active:scale-95"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="text-[11px] font-medium leading-tight text-muted-foreground">
                  {link.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
      {/* ── Expiring Packages ── */}
      {expiringPackages.length > 0 && (
        <div className="rounded-2xl bg-card ring-1 ring-amber-500/30 overflow-hidden">
          <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-border/40">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-amber-500">Packages Expiring Soon</h2>
            <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
              {expiringPackages.length} within 10 days
            </span>
            <Link href="/admin/clients" className="text-xs text-primary hover:underline ml-2">
              View all →
            </Link>
          </div>
          <div className="divide-y divide-border/40">
            {expiringPackages.map((pkg) => {
              const urgency =
                pkg.daysLeft <= 3
                  ? 'text-red-400 bg-red-500/15'
                  : pkg.daysLeft <= 7
                    ? 'text-amber-400 bg-amber-500/15'
                    : 'text-yellow-400 bg-yellow-500/15';
              const initials = pkg.clientName
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
              return (
                <div key={pkg.packageId} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{pkg.clientName}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      with {pkg.trainerName} · ends{' '}
                      {new Date(pkg.endDate).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold tabular-nums ${urgency}`}
                  >
                    {pkg.daysLeft}d left
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* ── Trainer Utilization chart ── */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50 p-5">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-sm font-semibold">Trainer Utilization</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Completed ÷ scheduled sessions {subLabel}
            </p>
          </div>
          <Link href="/admin/analytics" className="text-xs text-primary hover:underline">
            Full analytics →
          </Link>
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 20, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
                vertical={false}
              />
              <XAxis
                dataKey="name"
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                tick={{ fontSize: 11, fill: '#888' } as any}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                tick={{ fontSize: 11, fill: '#888' } as any}
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                formatter={(value) => [`${value}%`, 'Utilization']}
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="value" name="Utilization" radius={[4, 4, 0, 0]} maxBarSize={48}>
                <LabelList
                  dataKey="value"
                  position="top"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(v: any) => `${v}%`}
                  style={{ fontSize: 10, fill: '#888' }}
                />
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.value >= 70 ? '#10b981' : entry.value >= 40 ? '#f59e0b' : '#f87171'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No trainer data this month</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── KpiCard ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon,
  label,
  value,
  sub,
  color,
  bg,
  progress,
  progressColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  color: string;
  bg: string;
  progress?: number;
  progressColor?: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div
          className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', bg, color)}
        >
          {icon}
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums leading-none">{value}</p>
      {progress !== undefined && progressColor && (
        <div className="mt-2.5 h-1 w-full rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-all', progressColor)}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

// ─── ActivityBar ─────────────────────────────────────────────────────────────

function ActivityBar({
  label,
  value,
  max,
  color,
  textColor,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  textColor: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn('text-xs font-semibold tabular-nums', textColor)}>{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted/60">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
