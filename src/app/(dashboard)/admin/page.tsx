'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  ArrowLeftRight,
  BarChart3,
  Calendar,
  CalendarDays,
  ChevronRight,
  FileText,
  RefreshCw,
  Settings,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

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

// ─── Constants ────────────────────────────────────────────────────────────────

const QUICK_LINKS = [
  { label: 'Clients', href: '/admin/clients', icon: Users, desc: 'Manage members' },
  { label: 'Trainers', href: '/admin/trainers', icon: UserCheck, desc: 'Staff & schedules' },
  { label: 'Scheduling', href: '/admin/scheduling', icon: Calendar, desc: 'Session calendar' },
  { label: 'Leaves', href: '/admin/leaves', icon: CalendarDays, desc: 'Trainer leaves' },
  {
    label: 'Reassignment',
    href: '/admin/reassignments',
    icon: ArrowLeftRight,
    desc: 'Session handoffs',
  },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3, desc: 'Full reports' },
  { label: 'Audit Log', href: '/admin/audit-log', icon: FileText, desc: 'Change history' },
  { label: 'Settings', href: '/admin/settings', icon: Settings, desc: 'Branch config' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const month = getCurrentMonth();
      const base = `/api/admin/analytics?month=${month}`;
      const [u, c, n] = await Promise.all([
        fetch(`${base}&report=trainer-utilization`).then((res) => res.json()),
        fetch(`${base}&report=session-consumption`).then((res) => res.json()),
        fetch(`${base}&report=no-show-rate`).then((res) => res.json()),
      ]);
      setAnalytics({
        utilization: u.data ?? [],
        consumption: c.data ?? [],
        noShow: n.data ?? [],
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-5 pb-8">
        <div className="space-y-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
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
            onClick={() => fetchDashboard()}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </div>
      </div>
    );
  }

  const { utilization, consumption, noShow } = analytics;

  // KPIs
  const activeClients = consumption.length;
  const avgCompletion =
    utilization.length > 0
      ? Math.round(utilization.reduce((s, u) => s + u.utilizationPercent, 0) / utilization.length)
      : null;
  const totalNoShows = noShow.reduce((s, n) => s + n.noShowCount, 0);

  // Monthly session totals
  const totalScheduled = consumption.reduce(
    (s, c) => s + c.scheduled + c.completed + c.noShow + c.cancelled,
    0,
  );
  const totalCompleted = consumption.reduce((s, c) => s + c.completed, 0);

  // Chart data: first name only, sorted by utilization desc
  const chartData = [...utilization]
    .sort((a, b) => b.utilizationPercent - a.utilizationPercent)
    .map((t) => ({
      name: t.trainerName.split(' ')[0] ?? t.trainerName,
      value: t.utilizationPercent,
    }));

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      {/* ── Header ── */}
      <div>
        <p className="text-sm text-muted-foreground">{getGreeting()}</p>
        <h1 className="text-2xl font-bold tracking-tight">{session?.user?.firstName ?? 'Admin'}</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {new Date().toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
          {' · '}
          {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} overview
        </p>
      </div>

      {/* ── KPI strip — 3 compact tiles ── */}
      <div className="grid grid-cols-3 gap-3">
        <MiniKpi
          icon={<Users className="h-3.5 w-3.5" />}
          label="Clients"
          value={activeClients}
          sub="active"
          color="text-blue-500"
          bg="bg-blue-500/10"
        />
        <MiniKpi
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Completion"
          value={avgCompletion != null ? `${avgCompletion}%` : '—'}
          sub={`${utilization.length} trainer${utilization.length !== 1 ? 's' : ''}`}
          color="text-emerald-500"
          bg="bg-emerald-500/10"
        />
        <MiniKpi
          icon={<UserX className="h-3.5 w-3.5" />}
          label="No-shows"
          value={totalNoShows}
          sub="this month"
          color={totalNoShows > 0 ? 'text-red-500' : 'text-muted-foreground'}
          bg={totalNoShows > 0 ? 'bg-red-500/10' : 'bg-muted/60'}
        />
      </div>

      {/* ── Monthly Activity ── */}
      <div className="rounded-2xl bg-card ring-1 ring-border/50 overflow-hidden">
        <div className="px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Monthly Activity
          </h2>
        </div>
        <div className="divide-y divide-border/40 px-5">
          <ActivityRow label="Total Sessions" value={totalScheduled} dotColor="bg-blue-500" />
          <ActivityRow label="Completed" value={totalCompleted} dotColor="bg-emerald-500" />
          <ActivityRow label="No-Shows" value={totalNoShows} dotColor="bg-red-500" />
          <ActivityRow
            label="Remaining"
            value={consumption.reduce((s, c) => s + c.scheduled, 0)}
            dotColor="bg-amber-500"
          />
        </div>
        <div className="px-5 py-3 border-t border-border/40">
          <Link
            href="/admin/scheduling"
            className="text-sm font-medium text-primary hover:underline"
          >
            View scheduling →
          </Link>
        </div>
      </div>

      {/* ── Trainer Utilization bar chart ── */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Trainer Utilization
          </h2>
          <Link href="/admin/analytics" className="text-xs text-primary hover:underline">
            Full analytics →
          </Link>
        </div>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
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
              <Bar
                dataKey="value"
                name="Utilization"
                fill="#f97316"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No trainer data this month</p>
          </div>
        )}
      </div>

      {/* ── Quick Navigation — compact horizontal list ── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Quick Navigation
        </h2>
        <div className="rounded-2xl bg-card ring-1 ring-border/50 overflow-hidden divide-y divide-border/40">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted/60">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{link.label}</p>
                  <p className="text-xs text-muted-foreground">{link.desc}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── MiniKpi ─────────────────────────────────────────────────────────────────

function MiniKpi({
  icon,
  label,
  value,
  sub,
  color,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-3.5 ring-1 ring-border/50">
      <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${bg} ${color}`}>
        {icon}
      </div>
      <p className="mt-2.5 text-xl font-bold leading-none truncate">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{label}</p>
      <p className="text-[10px] text-muted-foreground truncate">{sub}</p>
    </div>
  );
}

// ─── ActivityRow ─────────────────────────────────────────────────────────────

function ActivityRow({
  label,
  value,
  dotColor,
}: {
  label: string;
  value: number;
  dotColor: string;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${dotColor}`} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
