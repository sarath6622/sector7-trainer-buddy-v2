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
  FileText,
  IndianRupee,
  RefreshCw,
  Settings,
  TrendingUp,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

// ---------- Types ----------

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

interface RevenueOverview {
  totalRevenue: number;
  paidCount: number;
  pendingCount: number;
  pendingAmount: number;
  byMethod: { method: string; amount: number; count: number }[];
}

interface DashboardAnalytics {
  utilization: TrainerUtilization[];
  consumption: SessionConsumption[];
  noShow: NoShowRate[];
  revenue: RevenueOverview;
}

// ---------- Constants ----------

const PIE_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

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

// ---------- Helpers ----------

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatCurrency(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ---------- Main Component ----------

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
      const [u, c, n, r] = await Promise.all([
        fetch(`${base}&report=trainer-utilization`).then((res) => res.json()),
        fetch(`${base}&report=session-consumption`).then((res) => res.json()),
        fetch(`${base}&report=no-show-rate`).then((res) => res.json()),
        fetch(`${base}&report=revenue`).then((res) => res.json()),
      ]);
      setAnalytics({
        utilization: u.data ?? [],
        consumption: c.data ?? [],
        noShow: n.data ?? [],
        revenue: r.data ?? {
          totalRevenue: 0,
          paidCount: 0,
          pendingCount: 0,
          pendingAmount: 0,
          byMethod: [],
        },
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

  // Loading state
  if (loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 pb-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
        <Skeleton className="h-56 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
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
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Derived KPIs
  const { utilization, consumption, noShow, revenue } = analytics;
  const totalRevenue = revenue.totalRevenue;
  const pendingAmount = revenue.pendingAmount;
  const activeClients = consumption.length;
  const avgCompletion =
    utilization.length > 0
      ? Math.round(utilization.reduce((s, u) => s + u.utilizationPercent, 0) / utilization.length)
      : 0;
  const totalNoShows = noShow.reduce((s, n) => s + n.noShowCount, 0);

  // Monthly session totals from consumption
  const totalScheduled = consumption.reduce(
    (s, c) => s + c.scheduled + c.completed + c.noShow + c.cancelled,
    0,
  );
  const totalCompleted = consumption.reduce((s, c) => s + c.completed, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-8">
      {/* Welcome header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {getGreeting()}, {session?.user?.firstName ?? 'Admin'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Branch overview for{' '}
            {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString('en-IN', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={<IndianRupee className="h-4 w-4" />}
          label="Total Revenue"
          value={formatCurrency(totalRevenue)}
          sub={pendingAmount > 0 ? `${formatCurrency(pendingAmount)} pending` : 'All collected'}
          iconColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-500/10"
        />
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          label="Active Clients"
          value={String(activeClients)}
          sub={`${activeClients} active package${activeClients !== 1 ? 's' : ''}`}
          iconColor="text-blue-600 dark:text-blue-400"
          iconBg="bg-blue-500/10"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Completion Rate"
          value={`${avgCompletion}%`}
          sub={`${utilization.length} trainer${utilization.length !== 1 ? 's' : ''}`}
          iconColor="text-primary"
          iconBg="bg-primary/10"
        />
        <KpiCard
          icon={<UserX className="h-4 w-4" />}
          label="No-Shows"
          value={String(totalNoShows)}
          sub="this month"
          iconColor={totalNoShows > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}
          iconBg={totalNoShows > 0 ? 'bg-red-500/10' : 'bg-muted/60'}
        />
      </div>

      {/* Activity + Utilization Chart row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Monthly Activity */}
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Monthly Activity
          </h2>
          <div className="mt-4 space-y-0">
            <ActivityRow label="Total Sessions" value={totalScheduled} dotColor="bg-blue-500" />
            <ActivityRow label="Completed" value={totalCompleted} dotColor="bg-emerald-500" />
            <ActivityRow label="No-Shows" value={totalNoShows} dotColor="bg-red-500" />
          </div>
          <div className="mt-4 border-t border-border/40 pt-3">
            <Link
              href="/admin/scheduling"
              className="text-sm font-medium text-primary hover:underline"
            >
              View scheduling →
            </Link>
          </div>
        </div>

        {/* Trainer Utilization Chart */}
        <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Trainer Utilization
          </h2>
          {utilization.length > 0 ? (
            <div className="mt-3">
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={utilization} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="trainerName"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickFormatter={(name: string) => name.split(' ')[0] ?? name}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    domain={[0, 100]}
                  />
                  <Tooltip
                    formatter={(value) => [`${value}%`, 'Utilization']}
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar
                    dataKey="utilizationPercent"
                    name="Utilization %"
                    fill="hsl(var(--primary))"
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No trainer data this month
            </p>
          )}
          <div className="mt-3 border-t border-border/40 pt-3">
            <Link
              href="/admin/analytics"
              className="text-sm font-medium text-primary hover:underline"
            >
              Full analytics →
            </Link>
          </div>
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Revenue Breakdown
          </h2>
          <Link
            href="/admin/analytics"
            className="text-sm font-medium text-primary hover:underline"
          >
            Full report →
          </Link>
        </div>

        {revenue.byMethod.length > 0 ? (
          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            {/* Pie chart */}
            <div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={revenue.byMethod}
                    dataKey="amount"
                    nameKey="method"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    innerRadius={40}
                    paddingAngle={2}
                    label={({ name }) => name}
                  >
                    {revenue.byMethod.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [formatCurrency(Number(value)), 'Amount']}
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Summary */}
            <div className="flex flex-col justify-center space-y-3">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <span className="text-sm text-muted-foreground">Collected</span>
                <span className="font-bold">{formatCurrency(totalRevenue)}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <span className="text-sm text-muted-foreground">Pending</span>
                <span
                  className={`font-medium ${pendingAmount > 0 ? 'text-red-600 dark:text-red-400' : ''}`}
                >
                  {formatCurrency(pendingAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Payments</span>
                <span className="text-sm">
                  {revenue.paidCount} paid / {revenue.pendingCount} pending
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No payment data this month
          </p>
        )}
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Quick Navigation
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="group flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border/50 transition-all hover:ring-primary/40 hover:shadow-sm"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 transition-colors group-hover:bg-primary/10">
                  <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">{link.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{link.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- Sub-components ----------

function KpiCard({
  icon,
  label,
  value,
  sub,
  iconColor,
  iconBg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  iconColor: string;
  iconBg: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-5 ring-1 ring-border/50">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}
        >
          {icon}
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

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
    <div className="flex items-center justify-between border-b border-border/40 py-2.5 last:border-0">
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${dotColor}`} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
