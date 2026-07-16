'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  AlarmClock,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePickerModal } from '@/components/ui/date-picker-modal';
import {
  describeDates,
  describeScope,
  formatDayHeading,
  formatTime12,
  type SessionDatePreset,
} from '@/lib/sessionStatsLabel';
import { overrunMinutes } from '@/lib/sessionOverrun';
import { SessionDetailSheet } from './SessionDetailSheet';

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

interface SessionStats {
  total: number;
  byStatus: Record<string, number>;
}

interface TrainerOption {
  id: string; // trainerProfileId
  name: string;
}

interface ClientOption {
  id: string; // clientProfileId
  name: string;
}

/**
 * One entry per status card. `activeClasses` light up when the card is the
 * current status filter — the cards ARE the status control on this page.
 */
const STATUS_META: {
  key: string;
  label: string;
  dot: string;
  activeClasses: string;
}[] = [
  {
    key: 'ALL',
    label: 'All',
    dot: 'bg-foreground/60',
    activeClasses: 'ring-2 ring-foreground/40 bg-muted/60',
  },
  {
    key: 'COMPLETED',
    label: 'Completed',
    dot: 'bg-emerald-500',
    activeClasses: 'ring-2 ring-emerald-500/50 bg-emerald-500/10',
  },
  {
    key: 'IN_PROGRESS',
    label: 'In Progress',
    dot: 'bg-amber-500',
    activeClasses: 'ring-2 ring-amber-500/50 bg-amber-500/10',
  },
  {
    key: 'SCHEDULED',
    label: 'Scheduled',
    dot: 'bg-blue-500',
    activeClasses: 'ring-2 ring-blue-500/50 bg-blue-500/10',
  },
  {
    key: 'NO_SHOW',
    label: 'No-Show',
    dot: 'bg-red-500',
    activeClasses: 'ring-2 ring-red-500/50 bg-red-500/10',
  },
  {
    key: 'CANCELLED',
    label: 'Cancelled',
    dot: 'bg-zinc-400',
    activeClasses: 'ring-2 ring-zinc-500/50 bg-zinc-500/10',
  },
];

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20',
  IN_PROGRESS: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20',
  COMPLETED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
  NO_SHOW: 'bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20',
  CANCELLED: 'bg-zinc-500/10 text-zinc-500 ring-zinc-500/20',
};

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

const DATE_PRESETS: { value: SessionDatePreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week' },
  { value: 'this_month', label: 'This month' },
  { value: 'custom', label: 'Custom' },
];

function initials(firstName: string, lastName: string) {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<SessionInstance[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState(''); // debounced, sent to the server
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [datePreset, setDatePreset] = useState<SessionDatePreset>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [trainerFilter, setTrainerFilter] = useState('');
  const [clientFilter, setClientFilter] = useState<ClientOption | null>(null);
  // Clients mapped to the selected trainer (via PT packages). null = no
  // trainer selected, so the client picker searches all clients instead.
  const [mappedClients, setMappedClients] = useState<ClientOption[] | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const { from: dateFrom, to: dateTo } = useMemo(() => {
    if (datePreset === 'custom') return { from: customFrom, to: customTo };
    return getPresetDates(datePreset);
  }, [datePreset, customFrom, customTo]);

  // Debounce the search box into the server-side `search` param
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const fetchSessions = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('page', String(page));
        params.set('pageSize', '20');
        if (statusFilter !== 'ALL') params.set('status', statusFilter);
        if (trainerFilter) params.set('trainerId', trainerFilter);
        if (clientFilter) params.set('clientId', clientFilter.id);
        if (search) params.set('search', search);
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
          setStats(json.stats ?? null);
        }
      } finally {
        setLoading(false);
        setInitialLoaded(true);
      }
    },
    [statusFilter, dateFrom, dateTo, trainerFilter, clientFilter, search],
  );

  useEffect(() => {
    fetchSessions(1);
  }, [fetchSessions]);

  // Trainer options for the filter dropdown
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/trainers');
        if (!res.ok) return;
        const { data } = await res.json();
        if (!cancelled) setTrainers(data ?? []);
      } catch {
        /* ignore — dropdown just stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // When a trainer is chosen, restrict the client picker to that trainer's
  // mapped clients (PT packages). A selected client outside the mapping is cleared.
  useEffect(() => {
    if (!trainerFilter) {
      setMappedClients(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/mappings?trainerId=${trainerFilter}`);
        if (!res.ok) return;
        const { data } = await res.json();
        if (cancelled) return;
        const seen = new Map<string, string>();
        for (const pkg of data as {
          clientProfileId: string;
          client: { user: { firstName: string; lastName: string } };
        }[]) {
          if (!seen.has(pkg.clientProfileId)) {
            seen.set(
              pkg.clientProfileId,
              `${pkg.client.user.firstName} ${pkg.client.user.lastName}`,
            );
          }
        }
        setMappedClients([...seen].map(([id, name]) => ({ id, name })));
        setClientFilter((cur) => (cur && !seen.has(cur.id) ? null : cur));
      } catch {
        /* ignore — picker falls back to showing no options */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trainerFilter]);

  const trainerName = useMemo(
    () => trainers.find((t) => t.id === trainerFilter)?.name ?? null,
    [trainers, trainerFilter],
  );

  // Group the page's sessions by calendar day (API returns them date-sorted)
  const dayGroups = useMemo(() => {
    const groups: { day: string; items: SessionInstance[] }[] = [];
    for (const s of sessions) {
      const day = s.scheduledDate.slice(0, 10);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(s);
      else groups.push({ day, items: [s] });
    }
    return groups;
  }, [sessions]);

  const scopeText = describeScope(clientFilter?.name ?? null, trainerName);
  const whenText = describeDates(datePreset, customFrom || undefined, customTo || undefined);
  const isRefetching = loading && initialLoaded;
  const hasActiveFilters =
    statusFilter !== 'ALL' ||
    datePreset !== 'today' ||
    trainerFilter !== '' ||
    clientFilter !== null ||
    searchInput !== '';

  if (!initialLoaded) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 pb-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-xl" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sessions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every PT session in your branch — filter, inspect and manage.
        </p>
      </div>

      {/* Toolbar — search + who + when, one wrapping row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search client or trainer…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-10 w-[210px] rounded-xl border-border/50 bg-card pl-9 text-sm"
          />
        </div>

        <select
          value={trainerFilter}
          onChange={(e) => setTrainerFilter(e.target.value)}
          className={cn(
            'block h-10 max-w-[190px] rounded-xl border border-border/50 bg-card px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-ring',
            trainerFilter ? 'font-medium text-foreground' : 'text-muted-foreground',
          )}
        >
          <option value="">All trainers</option>
          {trainers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>

        <ClientFilterSelect
          value={clientFilter?.id ?? ''}
          selectedLabel={clientFilter?.name ?? null}
          mappedOptions={mappedClients}
          onChange={(id, name) => setClientFilter(id ? { id, name: name ?? '' } : null)}
        />

        <div className="flex h-10 items-center rounded-xl bg-muted p-1 ring-1 ring-border/40">
          {DATE_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDatePreset(p.value)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                datePreset === p.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {datePreset === 'custom' && (
          <>
            <DatePickerModal
              value={customFrom}
              onChange={setCustomFrom}
              maxDate={customTo || undefined}
              className="h-10 w-[140px] text-xs"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <DatePickerModal
              value={customTo}
              onChange={setCustomTo}
              minDate={customFrom || undefined}
              className="h-10 w-[140px] text-xs"
            />
          </>
        )}

        {hasActiveFilters && (
          <Button
            variant="ghost"
            className="h-10 gap-1 text-muted-foreground"
            onClick={() => {
              setStatusFilter('ALL');
              setDatePreset('today');
              setCustomFrom('');
              setCustomTo('');
              setTrainerFilter('');
              setClientFilter(null);
              setSearchInput('');
            }}
          >
            <X className="h-3.5 w-3.5" />
            Reset
          </Button>
        )}
      </div>

      {/* Status cards — these ARE the status filter */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {STATUS_META.map(({ key, label, dot, activeClasses }) => {
            const count = key === 'ALL' ? stats.total : (stats.byStatus[key] ?? 0);
            const active = statusFilter === key;
            const muted = count === 0 && key !== 'ALL' && !active;
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(active && key !== 'ALL' ? 'ALL' : key)}
                aria-pressed={active}
                className={cn(
                  'rounded-xl bg-card px-3.5 py-3 text-left ring-1 ring-border/50 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md',
                  active && activeClasses,
                  muted && 'opacity-50',
                )}
              >
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className={cn('h-2 w-2 rounded-full', dot)} />
                  {label}
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{count}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Scope line — what the list below is showing */}
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold capitalize">{scopeText}</span>
        <span className="text-muted-foreground">· {whenText}</span>
        {statusFilter !== 'ALL' && (
          <span className="text-muted-foreground">
            · {statusFilter.replace('_', ' ').toLowerCase()} only
          </span>
        )}
        <span className="text-muted-foreground">
          · {pagination.total} session{pagination.total !== 1 ? 's' : ''}
        </span>
        {isRefetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {/* Sessions list, grouped by day */}
      <div
        className={cn(
          'space-y-4 transition-opacity duration-200',
          isRefetching && 'pointer-events-none opacity-50',
        )}
      >
        {dayGroups.length === 0 ? (
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
          dayGroups.map((group) => (
            <div key={group.day} className="space-y-1.5">
              <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {formatDayHeading(group.day)}
                <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/70">
                  · {group.items.length}
                </span>
              </p>
              {group.items.map((session) => {
                const badge = STATUS_BADGE[session.status] ?? STATUS_BADGE.SCHEDULED!;
                const overrun =
                  session.status === 'IN_PROGRESS'
                    ? overrunMinutes(session.startedAt, session.durationMin)
                    : 0;
                return (
                  <button
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    className="flex w-full items-center gap-3 rounded-xl bg-card px-4 py-3 text-left ring-1 ring-border/50 transition-all hover:bg-muted/40 hover:ring-border"
                  >
                    {/* Time */}
                    <div className="w-[76px] shrink-0">
                      <p className="text-sm font-semibold tabular-nums">
                        {formatTime12(session.scheduledTime)}
                      </p>
                      <p className="text-xs text-muted-foreground">{session.durationMin}min</p>
                    </div>

                    {/* Client (hidden when a client filter makes it constant) */}
                    {!clientFilter && (
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                          {initials(session.client.user.firstName, session.client.user.lastName)}
                        </span>
                        <p className="truncate text-sm font-medium">
                          {session.client.user.firstName} {session.client.user.lastName}
                        </p>
                      </div>
                    )}

                    {/* Trainer (hidden when a trainer filter makes it constant) */}
                    {!trainerFilter && (
                      <div className="hidden min-w-0 flex-1 items-center gap-2.5 md:flex">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-[11px] font-semibold text-violet-600 dark:text-violet-400">
                          {initials(
                            session.trainer.user.firstName,
                            session.trainer.user.lastName,
                          )}
                        </span>
                        <p className="truncate text-sm text-muted-foreground">
                          {session.trainer.user.firstName} {session.trainer.user.lastName}
                        </p>
                      </div>
                    )}

                    {/* Both filtered → keep the row balanced */}
                    {clientFilter && trainerFilter && <div className="flex-1" />}

                    {overrun > 0 && (
                      <span className="hidden shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400 sm:flex">
                        <AlarmClock className="h-3 w-3" />+{overrun}m over
                      </span>
                    )}

                    <Badge variant="outline" className={cn('shrink-0 text-[11px] ring-1', badge)}>
                      {session.status.replace('_', ' ')}
                    </Badge>

                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

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
              className="h-10 w-10 p-0"
              disabled={pagination.page <= 1}
              onClick={() => fetchSessions(pagination.page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-10 w-10 p-0"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => fetchSessions(pagination.page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <SessionDetailSheet
        sessionId={selectedSessionId}
        trainers={trainers}
        onOpenChange={(open) => {
          if (!open) setSelectedSessionId(null);
        }}
        onChanged={() => fetchSessions(pagination.page)}
      />
    </div>
  );
}

/**
 * Client filter picker. When a trainer filter is active, `mappedOptions` holds
 * that trainer's mapped clients and the picker filters them locally. With no
 * trainer selected it searches all clients server-side (debounced) so the full
 * client list is never loaded up front.
 */
function ClientFilterSelect({
  value,
  selectedLabel,
  mappedOptions,
  onChange,
}: {
  value: string;
  selectedLabel: string | null;
  mappedOptions: ClientOption[] | null;
  onChange: (id: string, name: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [serverResults, setServerResults] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Server-side search across all clients — only when no trainer is selected.
  useEffect(() => {
    if (!open || mappedOptions !== null) return;
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ role: 'CLIENT', pageSize: '20' });
        const term = search.trim();
        if (term) qs.set('search', term);
        const res = await fetch(`/api/admin/users?${qs.toString()}`);
        if (!res.ok) return;
        const { data } = await res.json();
        if (cancelled) return;
        setServerResults(
          (
            data as {
              firstName: string;
              lastName: string;
              clientProfile: { id: string } | null;
            }[]
          )
            .filter((u) => u.clientProfile)
            .map((u) => ({
              id: u.clientProfile!.id,
              name: `${u.firstName} ${u.lastName}`,
            })),
        );
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [search, open, mappedOptions]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const options = useMemo(() => {
    if (mappedOptions === null) return serverResults;
    const term = search.trim().toLowerCase();
    if (!term) return mappedOptions;
    return mappedOptions.filter((c) => c.name.toLowerCase().includes(term));
  }, [mappedOptions, serverResults, search]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setSearch('');
        }}
        className="flex h-10 w-[180px] items-center gap-1.5 rounded-xl border border-border/50 bg-card px-3 text-sm transition-colors hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span
          className={cn(
            'flex-1 truncate text-left',
            selectedLabel ? 'font-medium' : 'text-muted-foreground',
          )}
        >
          {selectedLabel ?? 'All clients'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[230px] overflow-hidden rounded-lg bg-popover shadow-lg ring-1 ring-foreground/10">
          <div className="border-b border-border/50 p-1.5">
            <Input
              autoFocus
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="max-h-56 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => {
                onChange('', null);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted',
                !value && 'font-medium',
              )}
            >
              All clients
            </button>
            {loading && mappedOptions === null ? (
              <p className="px-2.5 py-2 text-sm text-muted-foreground">Searching…</p>
            ) : options.length === 0 ? (
              <p className="px-2.5 py-2 text-sm text-muted-foreground">
                {mappedOptions !== null ? 'No clients mapped to this trainer' : 'No clients found'}
              </p>
            ) : (
              options.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(c.id, c.name);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted',
                    value === c.id && 'bg-muted font-medium',
                  )}
                >
                  <span className="truncate">{c.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
