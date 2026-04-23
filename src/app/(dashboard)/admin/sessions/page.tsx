'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Calendar, ChevronLeft, ChevronRight, Clock, Search, User, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface SessionInstance {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  client: {
    id: string;
    user: { firstName: string; lastName: string; email: string };
  };
  trainer: {
    id: string;
    user: { firstName: string; lastName: string; email: string };
  };
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const STATUS_OPTIONS = [
  'ALL',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'NO_SHOW',
  'CANCELLED',
] as const;

const STATUS_STYLE: Record<string, { badge: string; dot: string }> = {
  SCHEDULED: {
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20',
    dot: 'bg-blue-500',
  },
  IN_PROGRESS: {
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20',
    dot: 'bg-amber-500',
  },
  COMPLETED: {
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
    dot: 'bg-emerald-500',
  },
  NO_SHOW: {
    badge: 'bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20',
    dot: 'bg-red-500',
  },
  CANCELLED: {
    badge: 'bg-zinc-500/10 text-zinc-500 ring-zinc-500/20',
    dot: 'bg-zinc-400',
  },
};

function formatTime12(t: string) {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getPresetDates(preset: string): { from: string; to: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (preset === 'today') {
    const s = toISODate(today);
    return { from: s, to: s };
  }
  if (preset === 'yesterday') {
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const s = toISODate(y);
    return { from: s, to: s };
  }
  if (preset === 'this_week') {
    const day = today.getDay(); // 0=Sun
    const mon = new Date(today);
    mon.setDate(today.getDate() - ((day + 6) % 7)); // Monday
    return { from: toISODate(mon), to: toISODate(today) };
  }
  if (preset === 'this_month') {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: toISODate(first), to: toISODate(today) };
  }
  return { from: '', to: '' };
}

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'custom';

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<SessionInstance[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { from: dateFrom, to: dateTo } = useMemo(() => {
    if (datePreset === 'custom') return { from: customFrom, to: customTo };
    return getPresetDates(datePreset);
  }, [datePreset, customFrom, customTo]);

  const fetchSessions = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('pageSize', '20');
        if (statusFilter !== 'ALL') params.set('status', statusFilter);
        if (dateFrom && dateTo && dateFrom === dateTo) {
          params.set('date', dateFrom);
        } else {
          if (dateFrom) params.set('dateFrom', dateFrom);
          if (dateTo) params.set('dateTo', dateTo);
        }

        const res = await fetch(`/api/admin/sessions?${params}`);
        if (res.ok) {
          const json = await res.json();
          setSessions(json.data ?? []);
          setPagination(json.pagination);
        }
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, dateFrom, dateTo],
  );

  useEffect(() => {
    fetchSessions(1);
  }, [fetchSessions]);

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(
      (s) =>
        s.client.user.firstName.toLowerCase().includes(q) ||
        s.client.user.lastName.toLowerCase().includes(q) ||
        s.trainer.user.firstName.toLowerCase().includes(q) ||
        s.trainer.user.lastName.toLowerCase().includes(q),
    );
  }, [sessions, search]);

  // Stats from current page
  const stats = useMemo(() => {
    const total = pagination.total;
    const byStatus: Record<string, number> = {};
    sessions.forEach((s) => {
      byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
    });
    return { total, byStatus };
  }, [sessions, pagination.total]);

  if (loading && sessions.length === 0) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 pb-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const hasActiveFilters = statusFilter !== 'ALL' || datePreset !== 'today';

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sessions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats.total} total session{stats.total !== 1 ? 's' : ''}
            {statusFilter !== 'ALL' &&
              ` · Filtered by ${statusFilter.replace('_', ' ').toLowerCase()}`}
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by client or trainer name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        {/* Status dropdown */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-border/50 bg-card px-2.5 pr-7 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === 'ALL' ? 'All statuses' : s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Date preset + custom range */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Date</span>
          <div className="flex items-center gap-2">
            {/* Segmented preset buttons */}
            <div className="flex rounded-lg bg-muted p-0.5 ring-1 ring-border/40">
              {DATE_PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setDatePreset(p.value)}
                  className={cn(
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    datePreset === p.value
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom date inputs */}
            {datePreset === 'custom' && (
              <>
                <Input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 w-[140px] text-xs"
                />
                <span className="text-xs text-muted-foreground">→</span>
                <Input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 w-[140px] text-xs"
                />
              </>
            )}
          </div>
        </div>

        {/* Clear */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 self-end text-muted-foreground"
            onClick={() => {
              setStatusFilter('ALL');
              setDatePreset('today');
              setCustomFrom('');
              setCustomTo('');
            }}
          >
            <X className="h-3 w-3" />
            Reset
          </Button>
        )}
      </div>

      {/* Sessions list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-card py-16 ring-1 ring-border/50">
          <Calendar className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No sessions found</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {hasActiveFilters
              ? 'Try adjusting your filters'
              : 'Sessions will appear here once generated'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((session) => {
            const style = STATUS_STYLE[session.status] ?? STATUS_STYLE.SCHEDULED!;
            return (
              <div
                key={session.id}
                className="flex items-center gap-4 rounded-xl bg-card px-4 py-3 ring-1 ring-border/50 transition-colors hover:bg-muted/30"
              >
                {/* Status dot */}
                <div className="flex flex-col items-center gap-1">
                  <span className={cn('h-2.5 w-2.5 rounded-full', style.dot)} />
                </div>

                {/* Date & Time */}
                <div className="hidden w-[140px] shrink-0 sm:block">
                  <p className="text-sm font-medium">{formatDate(session.scheduledDate)}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatTime12(session.scheduledTime)} · {session.durationMin}min
                  </p>
                </div>

                {/* Client */}
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                    <User className="h-3.5 w-3.5 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {session.client.user.firstName} {session.client.user.lastName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground sm:hidden">
                      {formatDate(session.scheduledDate)} · {formatTime12(session.scheduledTime)}
                    </p>
                  </div>
                </div>

                {/* Trainer */}
                <div className="hidden min-w-0 flex-1 items-center gap-2.5 md:flex">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
                    <Users className="h-3.5 w-3.5 text-violet-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {session.trainer.user.firstName} {session.trainer.user.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">Trainer</p>
                  </div>
                </div>

                {/* Status badge */}
                <Badge variant="outline" className={cn('shrink-0 text-[11px] ring-1', style.badge)}>
                  {session.status.replace('_', ' ')}
                </Badge>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl bg-card px-4 py-2.5 ring-1 ring-border/50">
          <p className="text-xs text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} · {pagination.total} sessions
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={pagination.page <= 1}
              onClick={() => fetchSessions(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchSessions(pagination.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
