'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Mail, Phone, Plus, Search, Target, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

const AVATAR_COLORS = [
  {
    bg: 'from-violet-500/20 to-violet-500/5',
    ring: 'ring-violet-500/20',
    text: 'text-violet-600 dark:text-violet-400',
  },
  {
    bg: 'from-blue-500/20 to-blue-500/5',
    ring: 'ring-blue-500/20',
    text: 'text-blue-600 dark:text-blue-400',
  },
  {
    bg: 'from-emerald-500/20 to-emerald-500/5',
    ring: 'ring-emerald-500/20',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    bg: 'from-amber-500/20 to-amber-500/5',
    ring: 'ring-amber-500/20',
    text: 'text-amber-600 dark:text-amber-400',
  },
  {
    bg: 'from-rose-500/20 to-rose-500/5',
    ring: 'ring-rose-500/20',
    text: 'text-rose-600 dark:text-rose-400',
  },
  {
    bg: 'from-cyan-500/20 to-cyan-500/5',
    ring: 'ring-cyan-500/20',
    text: 'text-cyan-600 dark:text-cyan-400',
  },
  {
    bg: 'from-pink-500/20 to-pink-500/5',
    ring: 'ring-pink-500/20',
    text: 'text-pink-600 dark:text-pink-400',
  },
  {
    bg: 'from-teal-500/20 to-teal-500/5',
    ring: 'ring-teal-500/20',
    text: 'text-teal-600 dark:text-teal-400',
  },
];

function getColorForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
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
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clients</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {clients.length} total &middot; {activeCount} active
          </p>
        </div>
        <Link href="/admin/clients/new">
          <Button className="gap-2 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            Add Client
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? 'all')}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Client Cards */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">
            {search || statusFilter !== 'all' ? 'No clients match your filters' : 'No clients yet'}
          </p>
          {!search && statusFilter === 'all' && (
            <Link href="/admin/clients/new">
              <Button variant="outline" size="sm" className="gap-2">
                <Plus className="h-3.5 w-3.5" />
                Add your first client
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((client) => {
            const color = getColorForName(`${client.firstName} ${client.lastName}`);
            const initials = `${client.firstName[0]}${client.lastName[0]}`.toUpperCase();
            return (
              <Link
                key={client.id}
                href={`/admin/clients/${client.id}`}
                className="group rounded-2xl bg-card p-5 ring-1 ring-border/50 transition-all hover:ring-primary/40 hover:shadow-sm"
              >
                {/* Top: Avatar + Name + Status */}
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${color.bg} ring-2 ${color.ring}`}
                  >
                    <span className={`text-sm font-bold ${color.text}`}>{initials}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold group-hover:text-primary transition-colors">
                        {client.firstName} {client.lastName}
                      </p>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'shrink-0 text-[10px] px-1.5 py-0',
                          client.isActive
                            ? 'bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
                            : 'bg-zinc-500/15 text-zinc-500',
                        )}
                      >
                        {client.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="mt-4 space-y-2">
                  {client.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                  {client.clientProfile?.fitnessGoals && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Target className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{client.clientProfile.fitnessGoals}</span>
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
        <div className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 ring-1 ring-border/50">
          <p className="text-sm text-muted-foreground">
            {(pagination.page - 1) * pagination.pageSize + 1}–
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total}
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page <= 1}
              onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
