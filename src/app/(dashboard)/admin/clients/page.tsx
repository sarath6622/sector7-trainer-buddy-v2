'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  Phone,
  Plus,
  Search,
  Target,
  Users,
  X,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const AVATAR_COLORS = [
  { bg: 'bg-violet-500/20', text: 'text-violet-400' },
  { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  { bg: 'bg-rose-500/20', text: 'text-rose-400' },
  { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  { bg: 'bg-pink-500/20', text: 'text-pink-400' },
  { bg: 'bg-teal-500/20', text: 'text-teal-400' },
];

function getColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]!;
}

const STATUS_LABELS: Record<string, string> = {
  all: 'All',
  active: 'Active',
  inactive: 'Inactive',
};

const ATTENTION_LABELS: Record<string, string> = {
  all: 'Any',
  expiring_soon: 'Expiring soon',
  expired: 'Expired',
  low_sessions: 'Low sessions',
  used_up: 'Sessions used up',
};

/**
 * Renders the selected value of a filter dropdown with a persistent prefix label
 * ("Status: Active") so each control is self-describing even at its default —
 * three dropdowns all reading "All" is impossible to tell apart otherwise.
 */
function FilterValue({ label, text }: { label: string; text: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className="truncate">{text}</span>
    </span>
  );
}

/**
 * Highlights every search term inside a piece of text so the admin can see
 * exactly why a card matched (which is reassuring when a phone fragment or
 * email substring is what landed the hit).
 */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0 || !text) return <>{text}</>;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const lower = terms.map((t) => t.toLowerCase());
  const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        lower.includes(part.toLowerCase()) ? (
          <mark key={i} className="rounded bg-amber-400/30 text-inherit">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

interface ActivePackage {
  id: string;
  startDate: string;
  endDate: string | null;
  sessionsPerMonth: number;
  totalSessions: number;
  usedSessions: number;
  trainer: {
    user: { firstName: string; lastName: string };
  };
}

interface ClientUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  clientProfile: {
    id: string;
    currentWeight: number | null;
    fitnessGoals: string | null;
    ptPackages: ActivePackage[];
  } | null;
}

const PAGE_SIZE = 20;

export default function ClientListPage() {
  const [clients, setClients] = useState<ClientUser[]>([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, totalPages: 0, activeCount: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [attentionFilter, setAttentionFilter] = useState<string>('all');
  const [trainerFilter, setTrainerFilter] = useState<string>('all');
  const [trainers, setTrainers] = useState<{ id: string; name: string }[]>([]);

  // Trainer list for the assignment filter (id = trainerProfileId).
  useEffect(() => {
    fetch('/api/admin/trainers')
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json) => setTrainers(json.data ?? []))
      .catch(() => setTrainers([]));
  }, []);

  // Debounce the search box so we query once the admin pauses typing, and snap
  // back to page 1 whenever the query changes — the match may live on any page,
  // so searching from page 3 must re-run the search across the whole roster.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        role: 'CLIENT',
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (attentionFilter !== 'all') params.set('attention', attentionFilter);
      if (trainerFilter !== 'all') params.set('trainerId', trainerFilter);
      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const json = await res.json();
        setClients(json.data);
        setMeta({
          total: json.pagination.total,
          totalPages: json.pagination.totalPages,
          activeCount: json.activeCount ?? 0,
        });
      }
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, attentionFilter, trainerFilter]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Snap back to page 1 whenever a filter narrows the set (the match may live on
  // any page of the previous result).
  const applyFilter = (setter: (v: string) => void) => (v: string | null) => {
    setter(v ?? 'all');
    setPage(1);
  };

  const searchTerms = debouncedSearch.split(/\s+/).filter(Boolean);
  const searchPending = search.trim() !== debouncedSearch || (loading && debouncedSearch !== '');
  const showSkeleton = loading && clients.length === 0;
  const hasActiveFilter =
    debouncedSearch !== '' ||
    statusFilter !== 'all' ||
    attentionFilter !== 'all' ||
    trainerFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setAttentionFilter('all');
    setTrainerFilter('all');
    setPage(1);
  };

  return (
    <div className="space-y-3 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Clients</h1>
          <p className="text-xs text-muted-foreground">
            {hasActiveFilter
              ? `${meta.total} ${meta.total === 1 ? 'result' : 'results'}${
                  debouncedSearch ? ` for “${debouncedSearch}”` : ''
                }`
              : `${meta.total} total · ${meta.activeCount} active`}
          </p>
        </div>
        <Link
          href="/admin/clients/new"
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Client
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2">
        {/* Search — full width on its own row */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search all clients by name, email or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 pr-8 text-sm"
          />
          {searchPending ? (
            <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : (
            search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )
          )}
        </div>

        {/* Status + renewal + assignment filters — equal columns, 2-up on
            mobile, 3-up from sm. Each carries a persistent prefix label. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Select value={statusFilter} onValueChange={applyFilter(setStatusFilter)}>
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue>
                {(v) => (
                  <FilterValue
                    label="Status"
                    text={STATUS_LABELS[(v as string) ?? 'all'] ?? 'All'}
                  />
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>

          <Select value={attentionFilter} onValueChange={applyFilter(setAttentionFilter)}>
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue>
                {(v) => (
                  <FilterValue
                    label="Renewal"
                    text={ATTENTION_LABELS[(v as string) ?? 'all'] ?? 'Any'}
                  />
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any package</SelectItem>
              <SelectItem value="expiring_soon">Expiring soon</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="low_sessions">Low sessions</SelectItem>
              <SelectItem value="used_up">Sessions used up</SelectItem>
            </SelectContent>
          </Select>

          <Select value={trainerFilter} onValueChange={applyFilter(setTrainerFilter)}>
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue>
                {(v) => {
                  const id = (v as string) ?? 'all';
                  const text =
                    id === 'all'
                      ? 'All'
                      : id === 'unassigned'
                        ? 'Unassigned'
                        : (trainers.find((t) => t.id === id)?.name ?? 'Selected');
                  return <FilterValue label="Trainer" text={text} />;
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All trainers</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {trainers.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex h-7 w-fit items-center gap-1 self-start rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}
      </div>

      {/* Cards */}
      {showSkeleton ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {debouncedSearch
              ? `No clients match “${debouncedSearch}”`
              : hasActiveFilter
                ? 'No clients match your filters'
                : 'No clients yet'}
          </p>
          {!hasActiveFilter && (
            <Link
              href="/admin/clients/new"
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              Add your first client
            </Link>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'grid gap-2 sm:grid-cols-2 transition-opacity',
            loading && 'pointer-events-none opacity-50',
          )}
        >
          {clients.map((client) => {
            const fullName = `${client.firstName} ${client.lastName}`;
            const color = getColor(fullName);
            const initials = `${client.firstName[0]}${client.lastName[0]}`.toUpperCase();
            const pkg = client.clientProfile?.ptPackages?.[0] ?? null;

            // Package expiry calculations — sessions left is the source of truth
            // (clients pay for sessions, not time). Urgency thresholds are
            // expressed in day-equivalents using sessionsPerMonth (per 30 days).
            let sessionsLeft: number | null = null;
            let pctUsed = 0;
            let urgencyBar = 'bg-emerald-500';
            let urgencyBadge = 'bg-emerald-500/15 text-emerald-400';
            if (pkg && pkg.totalSessions > 0) {
              sessionsLeft = Math.max(0, pkg.totalSessions - pkg.usedSessions);
              pctUsed = Math.min(100, Math.round((pkg.usedSessions / pkg.totalSessions) * 100));
              const perDay = pkg.sessionsPerMonth / 30;
              const redThreshold = Math.max(1, Math.ceil(perDay * 7));
              const amberThreshold = Math.max(2, Math.ceil(perDay * 14));
              if (sessionsLeft <= redThreshold) {
                urgencyBar = 'bg-red-500';
                urgencyBadge = 'bg-red-500/15 text-red-400';
              } else if (sessionsLeft <= amberThreshold) {
                urgencyBar = 'bg-amber-500';
                urgencyBadge = 'bg-amber-500/15 text-amber-400';
              }
            }

            // Surface package-level issues that need admin attention as a
            // badge next to the client's Active/Inactive status.
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            let packageAlert: { label: string; className: string } | null = null;
            if (!pkg) {
              packageAlert = {
                label: 'No trainer',
                className: 'bg-amber-500/15 text-amber-400',
              };
            } else if (pkg.endDate && new Date(pkg.endDate) < today) {
              packageAlert = {
                label: 'Expired',
                className: 'bg-red-500/15 text-red-400',
              };
            } else if (sessionsLeft === 0) {
              packageAlert = {
                label: 'Sessions used',
                className: 'bg-red-500/15 text-red-400',
              };
            }

            return (
              <Link
                key={client.id}
                href={`/admin/clients/${client.id}`}
                className="flex flex-col gap-2 rounded-xl bg-card px-3 py-2.5 ring-1 ring-white/[0.06] transition-colors hover:ring-primary/30"
              >
                {/* Row 1: avatar + name + badge + contact */}
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      color.bg,
                      color.text,
                    )}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold leading-tight">
                        <Highlight text={fullName} terms={searchTerms} />
                      </p>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold',
                          client.isActive
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-zinc-500/15 text-zinc-400',
                        )}
                      >
                        {client.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {packageAlert && (
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold',
                            packageAlert.className,
                          )}
                        >
                          {packageAlert.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          <Highlight text={client.email} terms={searchTerms} />
                        </span>
                      </span>
                      {client.phone && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                            <Phone className="h-3 w-3" />
                            <Highlight text={client.phone} terms={searchTerms} />
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Fitness goal pill */}
                {client.clientProfile?.fitnessGoals && (
                  <div className="flex flex-wrap gap-1">
                    <span className="flex items-center gap-1 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      <Target className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{client.clientProfile.fitnessGoals}</span>
                    </span>
                  </div>
                )}

                {/* PT Package row */}
                {pkg ? (
                  <div className="border-t border-white/[0.05] pt-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground truncate">
                        {pkg.trainer.user.firstName} {pkg.trainer.user.lastName}
                        {' · '}
                        {pkg.sessionsPerMonth} sess/mo
                      </span>
                      {sessionsLeft !== null && (
                        <span
                          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold tabular-nums ${urgencyBadge}`}
                        >
                          {sessionsLeft}/{pkg.totalSessions} left
                        </span>
                      )}
                    </div>
                    {pkg.totalSessions > 0 && (
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${urgencyBar}`}
                          style={{ width: `${pctUsed}%` }}
                        />
                      </div>
                    )}
                    {pkg.endDate && (
                      <p className="text-[10px] text-muted-foreground/60">
                        Ends{' '}
                        {new Date(pkg.endDate).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="border-t border-white/[0.05] pt-2">
                    <p className="text-[10px] text-muted-foreground/50">No active package</p>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl bg-card px-4 py-2.5 ring-1 ring-white/[0.06]">
          <p className="text-xs text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, meta.total)} of {meta.total}
          </p>
          <div className="flex gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
