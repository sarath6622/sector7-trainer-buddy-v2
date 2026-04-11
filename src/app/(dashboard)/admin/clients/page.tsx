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
      {/* Header — single compact row */}
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

      {/* Filters — single row */}
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

      {/* List */}
      {loading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
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
        <div className="space-y-1.5">
          {filtered.map((client) => {
            const color = getColor(`${client.firstName} ${client.lastName}`);
            const initials = `${client.firstName[0]}${client.lastName[0]}`.toUpperCase();
            return (
              <Link
                key={client.id}
                href={`/admin/clients/${client.id}`}
                className="flex items-center gap-3 rounded-xl bg-card px-3 py-2.5 ring-1 ring-white/[0.06] transition-colors hover:ring-primary/30"
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    color.bg,
                    color.text,
                  )}
                >
                  {initials}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  {/* Row 1: name + badge */}
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold leading-tight">
                      {client.firstName} {client.lastName}
                    </p>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold leading-tight',
                        client.isActive
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-zinc-500/15 text-zinc-400',
                      )}
                    >
                      {client.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Row 2: email */}
                  <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{client.email}</span>
                  </div>

                  {/* Row 3: phone + goal (only if present) */}
                  {(client.phone || client.clientProfile?.fitnessGoals) && (
                    <div className="mt-0.5 flex items-center gap-2.5 text-[11px] text-muted-foreground/70">
                      {client.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3 shrink-0" />
                          {client.phone}
                        </span>
                      )}
                      {client.clientProfile?.fitnessGoals && (
                        <span className="flex min-w-0 items-center gap-1">
                          <Target className="h-3 w-3 shrink-0" />
                          <span className="truncate">{client.clientProfile.fitnessGoals}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
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
