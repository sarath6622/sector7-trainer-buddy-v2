'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  Clock,
  Dumbbell,
  RefreshCw,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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

interface ClientData {
  clientProfile: {
    id: string;
    fitnessGoals?: string;
    paymentStatus?: 'PAID' | 'PENDING';
    user: {
      firstName: string;
      lastName: string;
      email: string;
      phone?: string;
      profileImageUrl?: string;
    };
  };
  package: {
    id: string;
    sessionsPerMonth: number;
    sessionChargeAmount?: number;
  };
  stats: {
    totalThisMonth: number;
    completed: number;
    noShow: number;
    scheduled: number;
    used: number;
    remaining: number;
  };
  nextSession?: {
    id: string;
    scheduledDate: string;
    scheduledTime: string;
  };
}

export default function TrainerClientsPage() {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/trainer/clients');
      if (res.ok) {
        const { data } = await res.json();
        setClients(data);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  function formatTime(timeStr: string) {
    const [h = '0', m = '00'] = timeStr.split(':');
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const h12 = hour % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 pb-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground" />
          <p className="text-muted-foreground">Could not load clients.</p>
          <button
            onClick={fetchClients}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  const totalNoShows = clients.reduce((s, c) => s + c.stats.noShow, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Clients</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {clients.length} client{clients.length !== 1 ? 's' : ''} assigned
          {totalNoShows > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {' '}
              &middot; {totalNoShows} no-show{totalNoShows !== 1 ? 's' : ''} this month
            </span>
          )}
        </p>
      </div>

      {clients.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">No clients assigned to you yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((item) => {
            const fullName = `${item.clientProfile.user.firstName} ${item.clientProfile.user.lastName}`;
            const color = getColorForName(fullName);
            const initials =
              `${item.clientProfile.user.firstName[0]}${item.clientProfile.user.lastName[0]}`.toUpperCase();
            const usedPct =
              item.stats.totalThisMonth > 0
                ? Math.round((item.stats.used / item.stats.totalThisMonth) * 100)
                : 0;

            return (
              <Link
                key={item.clientProfile.id}
                href={`/trainer/clients/${item.clientProfile.id}/progress`}
                className="group rounded-2xl bg-card p-5 ring-1 ring-border/50 transition-all hover:ring-primary/40 hover:shadow-sm"
              >
                {/* Avatar + Name + Payment */}
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
                      {item.clientProfile.paymentStatus === 'PENDING' && (
                        <Badge variant="destructive" className="shrink-0 text-[10px] px-1.5 py-0">
                          Unpaid
                        </Badge>
                      )}
                    </div>
                    {item.clientProfile.fitnessGoals && (
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Target className="h-3 w-3 shrink-0" />
                        <span className="line-clamp-1">{item.clientProfile.fitnessGoals}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Session progress bar + stats */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                    <span>Sessions used</span>
                    <span className="font-medium text-foreground">
                      {item.stats.used}/{item.stats.totalThisMonth}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${Math.min(usedPct, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Stats row */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <StatPill
                    icon={<Dumbbell className="h-3 w-3" />}
                    value={item.stats.completed}
                    label="Done"
                    color="text-emerald-600 dark:text-emerald-400"
                    bg="bg-emerald-500/10"
                  />
                  <StatPill
                    icon={<Calendar className="h-3 w-3" />}
                    value={item.stats.remaining}
                    label="Left"
                    color="text-blue-600 dark:text-blue-400"
                    bg="bg-blue-500/10"
                  />
                  <StatPill
                    icon={<AlertCircle className="h-3 w-3" />}
                    value={item.stats.noShow}
                    label="No-show"
                    color={
                      item.stats.noShow > 0
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-muted-foreground'
                    }
                    bg={item.stats.noShow > 0 ? 'bg-red-500/10' : 'bg-muted/40'}
                  />
                </div>

                {/* Next session */}
                <div className="mt-3 border-t border-border/40 pt-3">
                  {item.nextSession ? (
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10">
                        <span className="text-sm font-bold leading-none text-primary">
                          {new Date(item.nextSession.scheduledDate).getDate()}
                        </span>
                        <span className="text-[9px] font-medium uppercase text-primary/70">
                          {new Date(item.nextSession.scheduledDate).toLocaleDateString('en-IN', {
                            month: 'short',
                          })}
                        </span>
                      </div>
                      <div className="min-w-0 text-xs">
                        <p className="font-medium">{formatDate(item.nextSession.scheduledDate)}</p>
                        <div className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{formatTime(item.nextSession.scheduledTime)}</span>
                        </div>
                      </div>
                      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>No upcoming sessions</span>
                    </div>
                  )}
                </div>

                {/* View progress link */}
                <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  <TrendingUp className="h-3.5 w-3.5" />
                  View progress
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatPill({
  icon,
  value,
  label,
  color,
  bg,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted/40 px-2.5 py-2">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${bg} ${color}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold leading-none">{value}</p>
        <p className="mt-0.5 text-[9px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}
