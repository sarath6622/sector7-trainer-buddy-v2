'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Mail, Phone, Plus, Search, Target, Users } from 'lucide-react';
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

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export default function ClientListPage() {
  const [clients, setClients] = useState<ClientUser[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        role: 'CLIENT',
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const json = await res.json();
        setClients(json.data);
        setPagination(json.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const filtered = clients.filter((c) => {
    const matchesSearch =
      !search ||
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && c.isActive) ||
      (statusFilter === 'inactive' && !c.isActive);
    return matchesSearch && matchesStatus;
  });

  const activeCount = clients.filter((c) => c.isActive).length;

  return (
    <div className="space-y-3 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Clients</h1>
          <p className="text-xs text-muted-foreground">
            {clients.length} total &middot; {activeCount} active
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
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
          <SelectTrigger className="h-9 w-[110px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {search || statusFilter !== 'all' ? 'No clients match your filters' : 'No clients yet'}
          </p>
          {!search && statusFilter === 'all' && (
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
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((client) => {
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
                      <p className="truncate text-sm font-semibold leading-tight">{fullName}</p>
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
                        <span className="truncate">{client.email}</span>
                      </span>
                      {client.phone && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                            <Phone className="h-3 w-3" />
                            {client.phone}
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
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl bg-card px-4 py-2.5 ring-1 ring-white/[0.06]">
          <p className="text-xs text-muted-foreground">
            {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total}
          </p>
          <div className="flex gap-1">
            <button
              disabled={pagination.page <= 1}
              onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
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
