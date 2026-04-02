'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { BarChart3, Download, IndianRupee, TrendingUp, UserX, Users } from 'lucide-react';
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
  PieChart,
  Pie,
  Cell,
  Legend,
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

interface RevenueOverview {
  totalRevenue: number;
  paidCount: number;
  pendingCount: number;
  pendingAmount: number;
  byMethod: { method: string; amount: number; count: number }[];
}

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#f59e0b', '#22c55e'];

const TABS = [
  { key: 'utilization', label: 'Utilization' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'consumption', label: 'Consumption' },
  { key: 'noshow', label: 'No-Shows' },
  { key: 'leaves', label: 'Leaves' },
  { key: 'revenue', label: 'Revenue' },
] as const;

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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
  const [revenue, setRevenue] = useState<RevenueOverview | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const base = `/api/admin/analytics?month=${month}`;
      const [u, a, c, n, l, r] = await Promise.all([
        fetch(`${base}&report=trainer-utilization`).then((r) => r.json()),
        fetch(`${base}&report=client-attendance`).then((r) => r.json()),
        fetch(`${base}&report=session-consumption`).then((r) => r.json()),
        fetch(`${base}&report=no-show-rate`).then((r) => r.json()),
        fetch(`${base}&report=leave-quota`).then((r) => r.json()),
        fetch(`${base}&report=revenue`).then((r) => r.json()),
      ]);
      setUtilization(u.data ?? []);
      setAttendance(a.data ?? []);
      setConsumption(c.data ?? []);
      setNoShow(n.data ?? []);
      setLeaveQuota(l.data ?? []);
      setRevenue(r.data ?? null);
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
  const totalRevenue = revenue?.totalRevenue ?? 0;

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
        {/* Revenue */}
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Revenue</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
              <IndianRupee className="h-4 w-4 text-emerald-500" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            ₹{totalRevenue.toLocaleString('en-IN')}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            {(revenue?.pendingAmount ?? 0) > 0 ? (
              <>
                <span className="text-amber-500">
                  ₹{(revenue?.pendingAmount ?? 0).toLocaleString('en-IN')} pending
                </span>
              </>
            ) : (
              <span className="text-emerald-500">All collected</span>
            )}
          </div>
        </div>

        {/* Utilization */}
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Avg Utilization</span>
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
            <span className="text-xs font-medium text-muted-foreground">Avg Attendance</span>
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
            <span className="text-xs font-medium text-muted-foreground">Total No-Shows</span>
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
              revenue: 'revenue',
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
              <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={utilization} barGap={4}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="trainerName"
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip content={<ChartTooltip />} />
                    <Bar
                      dataKey="completedSessions"
                      name="Completed"
                      fill="#3b82f6"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      dataKey="totalSessions"
                      name="Total"
                      fill="#3b82f620"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Trainer breakdown */}
              <div className="grid gap-3 sm:grid-cols-2">
                {utilization.map((t) => (
                  <div
                    key={t.trainerName}
                    className="flex items-center gap-4 rounded-xl bg-card px-4 py-3 ring-1 ring-border/50"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                      <span className="text-sm font-bold text-blue-500">
                        {t.trainerName
                          .split(' ')
                          .map((n) => n[0])
                          .join('')}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{t.trainerName}</p>
                      <ProgressBar
                        value={t.utilizationPercent}
                        color={
                          t.utilizationPercent >= 70
                            ? 'bg-blue-500'
                            : t.utilizationPercent >= 40
                              ? 'bg-amber-500'
                              : 'bg-red-400'
                        }
                      />
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold tabular-nums">{t.completedSessions}</p>
                      <p className="text-[10px] text-muted-foreground">of {t.totalSessions}</p>
                    </div>
                  </div>
                ))}
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
            attendance.map((a) => (
              <div
                key={a.clientName}
                className="flex items-center gap-4 rounded-xl bg-card px-4 py-3 ring-1 ring-border/50"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10">
                  <span className="text-sm font-bold text-violet-500">
                    {a.clientName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{a.clientName}</p>
                    {a.noShow > 0 && (
                      <Badge
                        variant="outline"
                        className="bg-red-500/10 text-red-500 ring-red-500/20 text-[10px] px-1.5 py-0"
                      >
                        {a.noShow} no-show{a.noShow > 1 ? 's' : ''}
                      </Badge>
                    )}
                  </div>
                  <ProgressBar
                    value={a.attendancePercent}
                    color={
                      a.attendancePercent >= 80
                        ? 'bg-emerald-500'
                        : a.attendancePercent >= 60
                          ? 'bg-amber-500'
                          : 'bg-red-400'
                    }
                  />
                </div>
                <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                  <span className="tabular-nums">{a.attended} attended</span>
                  <span className="text-border">|</span>
                  <span className="tabular-nums">{a.cancelled} cancelled</span>
                </div>
              </div>
            ))
          ) : (
            <EmptyState />
          )}
        </div>
      )}

      {activeTab === 'consumption' && (
        <div className="space-y-3">
          {consumption.length > 0 ? (
            consumption.map((c) => (
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
            ))
          ) : (
            <EmptyState />
          )}
        </div>
      )}

      {activeTab === 'noshow' && (
        <div className="space-y-4">
          {noShow.length > 0 ? (
            <>
              <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={noShow} barGap={4}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="trainerName"
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip content={<ChartTooltip />} />
                    <Bar
                      dataKey="noShowCount"
                      name="No-Shows"
                      fill="#ef4444"
                      radius={[6, 6, 0, 0]}
                    />
                    <Bar
                      dataKey="totalSessions"
                      name="Total Sessions"
                      fill="#ef444420"
                      radius={[6, 6, 0, 0]}
                    />
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
              <div className="rounded-2xl bg-card ring-1 ring-border/50 overflow-hidden divide-y divide-border/40">
                {leaveQuota.map((t) => {
                  const regularPct =
                    t.regular.quota > 0 ? (t.regular.used / t.regular.quota) * 100 : 0;
                  const emergencyPct =
                    t.emergency.quota > 0 ? (t.emergency.used / t.emergency.quota) * 100 : 0;
                  const regularFull = t.regular.remaining === 0;
                  const emergencyFull = t.emergency.remaining === 0;
                  return (
                    <div key={t.trainerProfileId} className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                          {t.trainerName
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{t.trainerName}</p>
                          {/* Regular leave bar */}
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-[10px] text-blue-500 w-16 shrink-0">Regular</span>
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${regularFull ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min(regularPct, 100)}%` }}
                              />
                            </div>
                            <span
                              className={`text-[10px] tabular-nums font-medium w-12 text-right shrink-0 ${regularFull ? 'text-red-500' : 'text-muted-foreground'}`}
                            >
                              {t.regular.used}/{t.regular.quota}d
                            </span>
                          </div>
                          {/* Emergency leave bar */}
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[10px] text-amber-500 w-16 shrink-0">
                              Emergency
                            </span>
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${emergencyFull ? 'bg-red-500' : 'bg-amber-500'}`}
                                style={{ width: `${Math.min(emergencyPct, 100)}%` }}
                              />
                            </div>
                            <span
                              className={`text-[10px] tabular-nums font-medium w-12 text-right shrink-0 ${emergencyFull ? 'text-red-500' : 'text-muted-foreground'}`}
                            >
                              {t.emergency.used}/{t.emergency.quota}d
                            </span>
                          </div>
                        </div>
                        {/* Status chips */}
                        <div className="shrink-0 flex flex-col gap-1 items-end">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${regularFull ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}
                          >
                            {t.regular.remaining}d left
                          </span>
                          {t.emergency.used > 0 && (
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${emergencyFull ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}
                            >
                              EM used
                            </span>
                          )}
                        </div>
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

      {activeTab === 'revenue' && (
        <div className="space-y-4">
          {revenue && revenue.byMethod.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-5">
              {/* Pie chart */}
              <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50 lg:col-span-3">
                <p className="mb-3 text-sm font-medium">Revenue by Payment Method</p>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={revenue.byMethod}
                      dataKey="amount"
                      nameKey="method"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {revenue.byMethod.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]!;
                        return (
                          <div className="rounded-lg bg-popover px-3 py-2 shadow-lg ring-1 ring-border/50">
                            <p className="text-xs font-medium">{d.name}</p>
                            <p className="text-xs text-muted-foreground">
                              ₹{Number(d.value).toLocaleString('en-IN')}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Legend
                      formatter={(value) => (
                        <span className="text-xs text-muted-foreground">{value}</span>
                      )}
                      iconType="circle"
                      iconSize={8}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Revenue summary */}
              <div className="space-y-3 lg:col-span-2">
                <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
                  <p className="text-xs font-medium text-muted-foreground">Collected</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-500 tabular-nums">
                    ₹{totalRevenue.toLocaleString('en-IN')}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {revenue.paidCount} payment{revenue.paidCount !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
                  <p className="text-xs font-medium text-muted-foreground">Pending</p>
                  <p className="mt-1 text-2xl font-bold text-amber-500 tabular-nums">
                    ₹{revenue.pendingAmount.toLocaleString('en-IN')}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {revenue.pendingCount} payment{revenue.pendingCount !== 1 ? 's' : ''}
                  </p>
                </div>
                {/* Method breakdown */}
                <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">Breakdown</p>
                  <div className="space-y-2.5">
                    {revenue.byMethod.map((m, i) => (
                      <div key={m.method} className="flex items-center gap-2.5">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-sm"
                          style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="flex-1 text-xs truncate">{m.method}</span>
                        <span className="text-xs font-medium tabular-nums">
                          ₹{m.amount.toLocaleString('en-IN')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState message="No payment data for this month" />
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
