'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, BarChart3, Download, Info, TrendingUp, UserX, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  LabelList,
} from 'recharts';

interface TrainerUtilization {
  trainerName: string;
  totalSessions: number;
  completedSessions: number;
  utilizationPercent: number;
}

interface ClientAttendance {
  clientName: string;
  totalSessions: number;
  attended: number;
  noShow: number;
  cancelled: number;
  attendancePercent: number;
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

interface TrainerLeaveBalance {
  trainerProfileId: string;
  trainerName: string;
  month: string;
  regular: { quota: number; used: number; remaining: number };
  emergency: { quota: number; used: number; remaining: number };
}

const TABS = [
  { key: 'utilization', label: 'Utilization' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'consumption', label: 'Consumption' },
  { key: 'noshow', label: 'No-Shows' },
  { key: 'leaves', label: 'Leaves' },
] as const;

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function InfoTooltip({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        aria-label="More info"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute z-[200] bottom-full right-0 mb-2 w-64 rounded-xl bg-popover p-3 text-xs text-muted-foreground shadow-xl ring-1 ring-border/50">
          {content}
          <div className="absolute -bottom-1.5 right-3 h-3 w-3 rotate-45 bg-popover ring-1 ring-border/50 clip-triangle" />
        </div>
      )}
    </div>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', color)}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-xs font-medium tabular-nums w-10 text-right">{value}%</span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg bg-popover px-3 py-2 shadow-lg ring-1 ring-border/50">
      <p className="text-xs font-medium">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-xs text-muted-foreground">
          <span
            className="inline-block h-2 w-2 rounded-sm mr-1.5"
            style={{ backgroundColor: p.color }}
          />
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('utilization');

  const [utilization, setUtilization] = useState<TrainerUtilization[]>([]);
  const [attendance, setAttendance] = useState<ClientAttendance[]>([]);
  const [consumption, setConsumption] = useState<SessionConsumption[]>([]);
  const [noShow, setNoShow] = useState<NoShowRate[]>([]);
  const [leaveQuota, setLeaveQuota] = useState<TrainerLeaveBalance[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const base = `/api/admin/analytics?month=${month}`;
      const [u, a, c, n, l] = await Promise.all([
        fetch(`${base}&report=trainer-utilization`).then((r) => r.json()),
        fetch(`${base}&report=client-attendance`).then((r) => r.json()),
        fetch(`${base}&report=session-consumption`).then((r) => r.json()),
        fetch(`${base}&report=no-show-rate`).then((r) => r.json()),
        fetch(`${base}&report=leave-quota`).then((r) => r.json()),
      ]);
      setUtilization(u.data ?? []);
      setAttendance(a.data ?? []);
      setConsumption(c.data ?? []);
      setNoShow(n.data ?? []);
      setLeaveQuota(l.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function handleExport(report: string) {
    window.open(`/api/admin/analytics/export?report=${report}&month=${month}`, '_blank');
  }

  // Computed KPIs
  const avgUtilization =
    utilization.length > 0
      ? Math.round(utilization.reduce((s, u) => s + u.utilizationPercent, 0) / utilization.length)
      : 0;
  const avgAttendance =
    attendance.length > 0
      ? Math.round(attendance.reduce((s, a) => s + a.attendancePercent, 0) / attendance.length)
      : 0;
  const totalNoShows = noShow.reduce((s, n) => s + n.noShowCount, 0);
  const atRiskClients = attendance.filter((a) => a.attendancePercent < 60).length;

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 pb-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-40 rounded-lg" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-[350px] rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Branch performance overview</p>
        </div>
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-9 w-[160px] text-sm"
        />
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* At-Risk Clients */}
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">At-Risk Clients</span>
              <InfoTooltip content="Clients whose attendance rate dropped below 60% this month. These are members most likely to churn — worth a proactive follow-up. Calculated from the Attendance report." />
            </div>
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg',
                atRiskClients > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10',
              )}
            >
              <AlertTriangle
                className={cn('h-4 w-4', atRiskClients > 0 ? 'text-amber-500' : 'text-emerald-500')}
              />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{atRiskClients}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {atRiskClients === 0
              ? 'All clients above 60% attendance'
              : `of ${attendance.length} client${attendance.length !== 1 ? 's' : ''} below 60%`}
          </p>
        </div>

        {/* Utilization */}
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Avg Utilization</span>
              <InfoTooltip content="Average trainer utilization across all trainers. Calculated as: (completed sessions ÷ total scheduled sessions) × 100, then averaged. Measures how efficiently trainer capacity is being used." />
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{avgUtilization}%</p>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-blue-500 transition-all"
              style={{ width: `${avgUtilization}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{utilization.length} trainers</p>
        </div>

        {/* Attendance */}
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Avg Attendance</span>
              <InfoTooltip content="Average client attendance rate across all active clients. Calculated as: (sessions attended ÷ total sessions assigned) × 100, then averaged. Cancelled sessions are excluded. Green ≥80%, Amber ≥60%, Red <60%." />
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <Users className="h-4 w-4 text-violet-500" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{avgAttendance}%</p>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                avgAttendance >= 80
                  ? 'bg-violet-500'
                  : avgAttendance >= 60
                    ? 'bg-amber-500'
                    : 'bg-red-500',
              )}
              style={{ width: `${avgAttendance}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{attendance.length} clients</p>
        </div>

        {/* No-Shows */}
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Total No-Shows</span>
              <InfoTooltip content="Total count of sessions where the client did not attend and did not cancel in advance. Summed across all trainers for the selected month. High no-shows may indicate scheduling or commitment issues." />
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
              <UserX className="h-4 w-4 text-red-500" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totalNoShows}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            across {noShow.length} trainer{noShow.length !== 1 ? 's' : ''} this month
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-xl bg-muted/40 p-1 ring-1 ring-border/50">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'bg-card text-foreground shadow-sm ring-1 ring-border/50'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            const reportMap: Record<string, string> = {
              utilization: 'trainer-utilization',
              attendance: 'client-attendance',
              consumption: 'session-consumption',
              noshow: 'no-show-rate',
              leaves: 'leave-quota',
            };
            handleExport(reportMap[activeTab]!);
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
      </div>

      {/* Tab content */}
      {activeTab === 'utilization' && (
        <div className="space-y-4">
          {utilization.length > 0 ? (
            <>
              <div className="flex items-center gap-2 px-0.5">
                <p className="text-sm font-medium">Completed vs Scheduled sessions per trainer</p>
                <InfoTooltip content="Utilization = completed sessions ÷ total scheduled sessions × 100. Green ≥70% (healthy), Amber ≥40% (moderate), Red <40% (underutilised). A trainer with 8 completed out of 10 scheduled = 80%." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {utilization.map((t) => {
                  const pct = t.utilizationPercent;
                  const barColor =
                    pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400';
                  const textColor =
                    pct >= 70 ? 'text-emerald-400' : pct >= 40 ? 'text-amber-400' : 'text-red-400';
                  const badgeBg =
                    t.totalSessions === 0
                      ? 'bg-muted/40'
                      : pct >= 70
                        ? 'bg-emerald-500/10'
                        : pct >= 40
                          ? 'bg-amber-500/10'
                          : 'bg-red-500/10';
                  const initials = t.trainerName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <div
                      key={t.trainerName}
                      className="rounded-xl bg-card ring-1 ring-border/50 px-4 py-3 flex items-center gap-3"
                    >
                      {/* Avatar */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                        {initials}
                      </div>
                      {/* Name + bar */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate mb-2">{t.trainerName}</p>
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'h-1.5 flex-1 rounded-full overflow-hidden',
                              t.totalSessions === 0
                                ? 'bg-[repeating-linear-gradient(90deg,transparent,transparent_4px,hsl(var(--muted))_4px,hsl(var(--muted))_8px)] opacity-40'
                                : 'bg-muted/60',
                            )}
                          >
                            {t.totalSessions > 0 && (
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all duration-500',
                                  barColor,
                                )}
                                style={{ width: pct === 0 ? '3px' : `${pct}%` }}
                              />
                            )}
                          </div>
                          <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                            {t.completedSessions}/{t.totalSessions}
                          </span>
                        </div>
                      </div>
                      {/* Rate badge */}
                      <div className="shrink-0">
                        <span
                          className={cn(
                            'text-xs font-bold tabular-nums px-2 py-0.5 rounded-full',
                            textColor,
                            badgeBg,
                          )}
                        >
                          {t.totalSessions === 0 ? '—' : `${pct}%`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState />
          )}
        </div>
      )}

      {activeTab === 'attendance' && (
        <div className="space-y-3">
          {attendance.length > 0 ? (
            <>
              <div className="flex items-center gap-2 px-0.5">
                <p className="text-sm font-medium">Client attendance rate this month</p>
                <InfoTooltip content="Attendance % = sessions attended ÷ total sessions × 100. No-show badges show missed sessions without cancellation. Green ≥80%, Amber ≥60%, Red <60%. Cancelled sessions are not counted against the client." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {attendance.map((a) => {
                  const pct = a.attendancePercent;
                  const barColor =
                    pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-400';
                  const textColor =
                    pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
                  const badgeBg =
                    a.totalSessions === 0
                      ? 'bg-muted/40'
                      : pct >= 80
                        ? 'bg-emerald-500/10'
                        : pct >= 60
                          ? 'bg-amber-500/10'
                          : 'bg-red-500/10';
                  const initials = a.clientName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <div
                      key={a.clientName}
                      className="rounded-xl bg-card ring-1 ring-border/50 px-4 py-3 flex items-center gap-3"
                    >
                      {/* Avatar */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-400">
                        {initials}
                      </div>
                      {/* Name + bar */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-2">
                          <p className="text-sm font-medium truncate">{a.clientName}</p>
                          {a.noShow > 0 && (
                            <span className="text-[10px] text-red-400 tabular-nums shrink-0">
                              {a.noShow} no-show{a.noShow > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'h-1.5 flex-1 rounded-full overflow-hidden',
                              a.totalSessions === 0
                                ? 'bg-[repeating-linear-gradient(90deg,transparent,transparent_4px,hsl(var(--muted))_4px,hsl(var(--muted))_8px)] opacity-40'
                                : 'bg-muted/60',
                            )}
                          >
                            {a.totalSessions > 0 && (
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all duration-500',
                                  barColor,
                                )}
                                style={{ width: pct === 0 ? '3px' : `${pct}%` }}
                              />
                            )}
                          </div>
                          <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                            {a.attended}/{a.totalSessions}
                          </span>
                        </div>
                      </div>
                      {/* Rate badge */}
                      <div className="shrink-0 text-right">
                        <span
                          className={cn(
                            'text-xs font-bold tabular-nums px-2 py-0.5 rounded-full',
                            textColor,
                            badgeBg,
                          )}
                        >
                          {a.totalSessions === 0 ? '—' : `${pct}%`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <EmptyState />
          )}
        </div>
      )}

      {activeTab === 'consumption' && (
        <div className="space-y-3">
          {consumption.length > 0 ? (
            <>
              <div className="flex items-center gap-2 px-0.5">
                <p className="text-sm font-medium">Session quota usage per client</p>
                <InfoTooltip content="Consumption % = (completed + no-shows) ÷ monthly session quota × 100. CF (carry-forward) = unused sessions rolled over from a prior month. Green ≥80%, Amber ≥50%, Red <50%. Low consumption may mean sessions are not being scheduled." />
              </div>
              {consumption.map((c) => (
                <div
                  key={c.clientName}
                  className="rounded-xl bg-card px-4 py-3 ring-1 ring-border/50"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10">
                      <span className="text-sm font-bold text-amber-500">
                        {c.clientName
                          .split(' ')
                          .map((n) => n[0])
                          .join('')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{c.clientName}</p>
                        {c.carryForward > 0 && (
                          <Badge
                            variant="outline"
                            className="bg-blue-500/10 text-blue-500 ring-blue-500/20 text-[10px] px-1.5 py-0"
                          >
                            +{c.carryForward} CF
                          </Badge>
                        )}
                      </div>
                      <ProgressBar
                        value={c.consumptionPercent}
                        color={
                          c.consumptionPercent >= 80
                            ? 'bg-emerald-500'
                            : c.consumptionPercent >= 50
                              ? 'bg-amber-500'
                              : 'bg-red-400'
                        }
                      />
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold tabular-nums">{c.completed + c.noShow}</p>
                      <p className="text-[10px] text-muted-foreground">of {c.sessionsPerMonth}</p>
                    </div>
                  </div>
                  {/* Mini stat chips */}
                  <div className="mt-2 flex flex-wrap gap-2 pl-14">
                    <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      {c.completed} completed
                    </span>
                    <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                      {c.scheduled} scheduled
                    </span>
                    {c.noShow > 0 && (
                      <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500">
                        {c.noShow} no-show
                      </span>
                    )}
                    {c.cancelled > 0 && (
                      <span className="rounded-md bg-zinc-500/10 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                        {c.cancelled} cancelled
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <EmptyState />
          )}
        </div>
      )}

      {activeTab === 'noshow' && (
        <div className="space-y-4">
          {noShow.length > 0 ? (
            <>
              <div className="flex items-center gap-2 px-0.5">
                <p className="text-sm font-medium">No-show rate per trainer</p>
                <InfoTooltip content="No-show % = sessions missed without cancellation ÷ total sessions × 100. Red ≥20% (high risk), Amber ≥10% (watch), Green <10% (healthy). Grouped by trainer so you can see which trainer's clients are most disengaged." />
              </div>
              <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={noShow} barGap={6} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis
                      dataKey="trainerName"
                      tick={{ fontSize: 12, fill: '#94a3b8' }}
                      axisLine={{ stroke: '#475569' }}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <RechartsTooltip
                      content={<ChartTooltip />}
                      cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                    />
                    <Legend
                      formatter={(value) => (
                        <span className="text-xs text-muted-foreground">{value}</span>
                      )}
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ paddingTop: 12 }}
                    />
                    <Bar
                      dataKey="totalSessions"
                      name="Total Sessions"
                      fill="#334155"
                      radius={[6, 6, 0, 0]}
                    >
                      <LabelList
                        dataKey="totalSessions"
                        position="top"
                        style={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                      />
                    </Bar>
                    <Bar dataKey="noShowCount" name="No-Shows" fill="#ef4444" radius={[6, 6, 0, 0]}>
                      <LabelList
                        dataKey="noShowCount"
                        position="top"
                        style={{ fontSize: 11, fill: '#f87171', fontWeight: 600 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* No-show breakdown */}
              <div className="grid gap-3 sm:grid-cols-2">
                {noShow.map((n) => (
                  <div
                    key={n.trainerName}
                    className="flex items-center gap-4 rounded-xl bg-card px-4 py-3 ring-1 ring-border/50"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
                      <UserX className="h-4 w-4 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{n.trainerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {n.noShowCount} no-show{n.noShowCount !== 1 ? 's' : ''} of {n.totalSessions}{' '}
                        sessions
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs ring-1 tabular-nums',
                        n.noShowPercent >= 20
                          ? 'bg-red-500/10 text-red-500 ring-red-500/20'
                          : n.noShowPercent >= 10
                            ? 'bg-amber-500/10 text-amber-500 ring-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/20',
                      )}
                    >
                      {n.noShowPercent}%
                    </Badge>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState />
          )}
        </div>
      )}

      {activeTab === 'leaves' && (
        <div className="space-y-3">
          {leaveQuota.length > 0 ? (
            <>
              <div className="flex items-center gap-2 px-0.5">
                <p className="text-sm font-medium">Trainer leave usage this month</p>
                <InfoTooltip content="Each trainer gets a monthly quota of regular and emergency leave days (configured in Settings). The bar shows days used vs quota. Red bar = quota exhausted. 'EM used' badge means at least one emergency leave was taken." />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {leaveQuota.map((t) => {
                  const regularPct =
                    t.regular.quota > 0 ? (t.regular.used / t.regular.quota) * 100 : 0;
                  const emergencyPct =
                    t.emergency.quota > 0 ? (t.emergency.used / t.emergency.quota) * 100 : 0;
                  const regularFull = t.regular.remaining === 0;
                  const emergencyFull = t.emergency.remaining === 0;
                  const initials = t.trainerName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <div
                      key={t.trainerProfileId}
                      className="rounded-xl bg-card ring-1 ring-border/50 px-4 py-3 flex items-center gap-3"
                    >
                      {/* Avatar */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                        {initials}
                      </div>
                      {/* Name + bars */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate mb-2">{t.trainerName}</p>
                        {/* Regular row */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-blue-400 w-14 shrink-0">Regular</span>
                          <div
                            className="h-1.5 rounded-full bg-muted/60 overflow-hidden"
                            style={{ flex: 7 }}
                          >
                            <div
                              className={`h-full rounded-full transition-all ${regularFull ? 'bg-red-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.min(regularPct, 100)}%` }}
                            />
                          </div>
                          <span
                            className={`text-[10px] tabular-nums font-medium shrink-0 w-8 text-right ${regularFull ? 'text-red-400' : 'text-muted-foreground'}`}
                          >
                            {t.regular.used}/{t.regular.quota}d
                          </span>
                        </div>
                        {/* Emergency row */}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-amber-400 w-14 shrink-0">
                            Emergency
                          </span>
                          <div
                            className="h-1.5 rounded-full bg-muted/60 overflow-hidden"
                            style={{ flex: 7 }}
                          >
                            <div
                              className={`h-full rounded-full transition-all ${emergencyFull ? 'bg-red-500' : 'bg-amber-500'}`}
                              style={{ width: `${Math.min(emergencyPct, 100)}%` }}
                            />
                          </div>
                          <span
                            className={`text-[10px] tabular-nums font-medium shrink-0 w-8 text-right ${emergencyFull ? 'text-red-400' : 'text-muted-foreground'}`}
                          >
                            {t.emergency.used}/{t.emergency.quota}d
                          </span>
                        </div>
                      </div>
                      {/* Days left badge */}
                      <div className="shrink-0 text-right">
                        <span
                          className={`text-xs font-bold tabular-nums ${regularFull ? 'text-red-400' : 'text-blue-400'}`}
                        >
                          {t.regular.remaining}d left
                        </span>
                        {t.emergency.used > 0 && (
                          <p
                            className={`text-[10px] font-semibold mt-0.5 ${emergencyFull ? 'text-red-400' : 'text-amber-400'}`}
                          >
                            EM used
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Quota: {leaveQuota[0]?.regular.quota ?? 5} regular +{' '}
                {leaveQuota[0]?.emergency.quota ?? 1} emergency day(s) per month · Configure in
                Settings
              </p>
            </>
          ) : (
            <EmptyState message="No trainers found" />
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ message = 'No data for this month' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-card py-16 ring-1 ring-border/50">
      <BarChart3 className="mb-3 h-10 w-10 text-muted-foreground/40" />
      <p className="text-sm font-medium text-muted-foreground">{message}</p>
    </div>
  );
}
