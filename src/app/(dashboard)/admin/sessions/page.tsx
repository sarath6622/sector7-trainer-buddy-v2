'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';
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
  const [dateFilter, setDateFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchSessions = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('pageSize', '20');
        if (statusFilter !== 'ALL') params.set('status', statusFilter);
        if (dateFilter) params.set('date', dateFilter);

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
    [statusFilter, dateFilter],
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

  const hasActiveFilters = statusFilter !== 'ALL' || dateFilter !== '';

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

      {/* Search + Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by client or trainer name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className={cn('gap-1.5', hasActiveFilters && 'border-primary text-primary')}
          onClick={() => setShowFilters(!showFilters)}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {hasActiveFilters && (
            <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {(statusFilter !== 'ALL' ? 1 : 0) + (dateFilter ? 1 : 0)}
            </span>
          )}
        </Button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="flex flex-wrap items-end gap-4 rounded-xl bg-muted/40 px-4 py-3 ring-1 ring-border/50">
          {/* Status pills */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Status</span>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    statusFilter === s
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-card text-muted-foreground ring-1 ring-border/50 hover:bg-muted',
                  )}
                >
                  {s === 'ALL' ? 'All' : s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Date filter */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Date</span>
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-8 w-[160px] text-sm"
            />
          </div>

          {/* Clear filters */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-muted-foreground"
              onClick={() => {
                setStatusFilter('ALL');
                setDateFilter('');
              }}
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          )}
        </div>
      )}

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
