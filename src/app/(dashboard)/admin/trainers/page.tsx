'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Mail,
  Phone,
  Plus,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

const AVATAR_COLORS = [
  {
    bg: 'from-indigo-500/20 to-indigo-500/5',
    ring: 'ring-indigo-500/20',
    text: 'text-indigo-600 dark:text-indigo-400',
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
    bg: 'from-violet-500/20 to-violet-500/5',
    ring: 'ring-violet-500/20',
    text: 'text-violet-600 dark:text-violet-400',
  },
  {
    bg: 'from-teal-500/20 to-teal-500/5',
    ring: 'ring-teal-500/20',
    text: 'text-teal-600 dark:text-teal-400',
  },
  {
    bg: 'from-fuchsia-500/20 to-fuchsia-500/5',
    ring: 'ring-fuchsia-500/20',
    text: 'text-fuchsia-600 dark:text-fuchsia-400',
  },
];

function getColorForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}

const SHORT_DAYS: Record<string, string> = {
  MONDAY: 'Mon',
  TUESDAY: 'Tue',
  WEDNESDAY: 'Wed',
  THURSDAY: 'Thu',
  FRIDAY: 'Fri',
  SATURDAY: 'Sat',
  SUNDAY: 'Sun',
};

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

function formatTime(t: string) {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

interface TrainerUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  trainerProfile: {
    id: string;
    specialties: string[];
    workingHoursStart: string | null;
    workingHoursEnd: string | null;
    workingDays: string[];
  } | null;
}

interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export default function TrainerListPage() {
  const [trainers, setTrainers] = useState<TrainerUser[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchTrainers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        role: 'TRAINER',
        page: String(pagination.page),
        pageSize: String(pagination.pageSize),
      });
      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const json = await res.json();
        setTrainers(json.data);
        setPagination(json.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch trainers:', err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize]);

  useEffect(() => {
    fetchTrainers();
  }, [fetchTrainers]);

  const filtered = trainers.filter((t) => {
    if (!search) return true;
    const fullName = `${t.firstName} ${t.lastName}`.toLowerCase();
    return (
      fullName.includes(search.toLowerCase()) ||
      t.email.toLowerCase().includes(search.toLowerCase())
    );
  });

  const activeCount = trainers.filter((t) => t.isActive).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trainers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {trainers.length} total &middot; {activeCount} active
          </p>
        </div>
        <Link href="/admin/trainers/new">
          <Button className="gap-2 bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            Add Trainer
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Trainer Cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">
            {search ? 'No trainers match your search' : 'No trainers yet'}
          </p>
          {!search && (
            <Link href="/admin/trainers/new">
              <Button variant="outline" size="sm" className="gap-2">
                <Plus className="h-3.5 w-3.5" />
                Add your first trainer
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((trainer) => {
            const fullName = `${trainer.firstName} ${trainer.lastName}`;
            const color = getColorForName(fullName);
            const initials = `${trainer.firstName[0]}${trainer.lastName[0]}`.toUpperCase();
            const profile = trainer.trainerProfile;
            const sortedDays =
              profile?.workingDays
                .slice()
                .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)) ?? [];

            return (
              <Link
                key={trainer.id}
                href={`/admin/trainers/${trainer.id}`}
                className="group rounded-2xl bg-card p-5 ring-1 ring-border/50 transition-all hover:ring-primary/40 hover:shadow-sm"
              >
                {/* Avatar + Name + Status */}
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${color.bg} ring-2 ${color.ring}`}
                  >
                    <span className={`text-sm font-bold ${color.text}`}>{initials}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold group-hover:text-primary transition-colors">
                        {fullName}
                      </p>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'shrink-0 text-[10px] px-1.5 py-0',
                          trainer.isActive
                            ? 'bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400'
                            : 'bg-zinc-500/15 text-zinc-500',
                        )}
                      >
                        {trainer.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{trainer.email}</span>
                    </div>
                  </div>
                </div>

                {/* Contact */}
                {trainer.phone && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span>{trainer.phone}</span>
                  </div>
                )}

                {/* Specialties */}
                {profile && profile.specialties.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                      <Sparkles className="h-3 w-3" />
                      <span>Specialties</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.specialties.map((s) => (
                        <span
                          key={s}
                          className="rounded-lg bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Schedule */}
                <div className="mt-3 border-t border-border/40 pt-3 space-y-2">
                  {/* Working hours */}
                  {profile?.workingHoursStart && profile?.workingHoursEnd ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                      <span>
                        {formatTime(profile.workingHoursStart)} –{' '}
                        {formatTime(profile.workingHoursEnd)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>Hours not set</span>
                    </div>
                  )}

                  {/* Working days */}
                  {sortedDays.length > 0 && (
                    <div className="flex gap-1">
                      {DAY_ORDER.map((day) => {
                        const isWorking = sortedDays.includes(day);
                        return (
                          <span
                            key={day}
                            className={`flex h-6 w-6 items-center justify-center rounded-md text-[9px] font-semibold ${
                              isWorking
                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                : 'bg-muted/40 text-muted-foreground/40'
                            }`}
                          >
                            {SHORT_DAYS[day]?.[0]}
                          </span>
                        );
                      })}
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
