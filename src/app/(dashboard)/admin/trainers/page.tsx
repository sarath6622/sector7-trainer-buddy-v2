'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Clock, Mail, Phone, Plus, Search, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

const AVATAR_COLORS = [
  { bg: 'bg-indigo-500/20', text: 'text-indigo-400' },
  { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  { bg: 'bg-rose-500/20', text: 'text-rose-400' },
  { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  { bg: 'bg-violet-500/20', text: 'text-violet-400' },
  { bg: 'bg-teal-500/20', text: 'text-teal-400' },
  { bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-400' },
];

function getColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]!;
}

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAY_INITIAL: Record<string, string> = {
  MONDAY: 'M',
  TUESDAY: 'T',
  WEDNESDAY: 'W',
  THURSDAY: 'T',
  FRIDAY: 'F',
  SATURDAY: 'S',
  SUNDAY: 'S',
};

function formatTime(t: string) {
  const [h = '0', m = '00'] = t.split(':');
  const hour = parseInt(h, 10);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
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
    <div className="space-y-3 pb-8">
      {/* Header — single compact row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Trainers</h1>
          <p className="text-xs text-muted-foreground">
            {trainers.length} total &middot; {activeCount} active
          </p>
        </div>
        <Link
          href="/admin/trainers/new"
          className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Trainer
        </Link>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 pl-8 text-sm"
        />
      </div>

      {/* Cards */}
      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60">
            <Users className="h-5 w-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            {search ? 'No trainers match your search' : 'No trainers yet'}
          </p>
          {!search && (
            <Link
              href="/admin/trainers/new"
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              Add your first trainer
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((trainer) => {
            const fullName = `${trainer.firstName} ${trainer.lastName}`;
            const color = getColor(fullName);
            const initials = `${trainer.firstName[0]}${trainer.lastName[0]}`.toUpperCase();
            const profile = trainer.trainerProfile;
            const sortedDays =
              profile?.workingDays
                .slice()
                .sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)) ?? [];
            const hasHours = profile?.workingHoursStart && profile?.workingHoursEnd;

            return (
              <Link
                key={trainer.id}
                href={`/admin/trainers/${trainer.id}`}
                className="flex flex-col gap-2 rounded-xl bg-card px-3 py-2.5 ring-1 ring-white/[0.06] transition-colors hover:ring-primary/30"
              >
                {/* Row 1: avatar + name + badge + phone */}
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
                          trainer.isActive
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-zinc-500/15 text-zinc-400',
                        )}
                      >
                        {trainer.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{trainer.email}</span>
                      </span>
                      {trainer.phone && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                            <Phone className="h-3 w-3" />
                            {trainer.phone}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Specialties */}
                {profile && profile.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {profile.specialties.map((s) => (
                      <span
                        key={s}
                        className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {/* Schedule: hours + day dots on one row */}
                {(hasHours || sortedDays.length > 0) && (
                  <div className="flex items-center justify-between border-t border-white/[0.05] pt-2">
                    {hasHours ? (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                        <Clock className="h-3 w-3 text-blue-400" />
                        {formatTime(profile!.workingHoursStart!)}–
                        {formatTime(profile!.workingHoursEnd!)}
                      </span>
                    ) : (
                      <span />
                    )}
                    {sortedDays.length > 0 && (
                      <div className="flex gap-0.5">
                        {DAY_ORDER.map((day) => (
                          <span
                            key={day}
                            className={cn(
                              'flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold',
                              sortedDays.includes(day)
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'text-muted-foreground/25',
                            )}
                          >
                            {DAY_INITIAL[day]}
                          </span>
                        ))}
                      </div>
                    )}
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
