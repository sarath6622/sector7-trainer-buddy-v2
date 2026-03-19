'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, Dumbbell, TrendingUp, User } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SessionTimer } from '@/components/timer/SessionTimer';

interface DashboardData {
  sessionCount: {
    total: number;
    completed: number;
    noShow: number;
    cancelled: number;
    scheduled: number;
    inProgress: number;
    carryForward: number;
    used: number;
    remaining: number;
  };
  nextSession?: {
    id: string;
    scheduledDate: string;
    scheduledTime: string;
    durationMin: number;
    trainer: {
      user: { firstName: string; lastName: string };
    };
  };
  activeSession?: {
    id: string;
    startedAt: string;
    durationMin: number;
    trainer: {
      user: { firstName: string; lastName: string };
    };
  };
  trainer?: {
    name: string;
    sessionsPerMonth: number;
  };
}

export default function ClientDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch('/api/client/dashboard');
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Could not load dashboard.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Dashboard</h1>

      {/* Active session with live timer */}
      {data.activeSession && (
        <Card className="border-primary/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Session In Progress</CardTitle>
              <Badge variant="default" className="bg-green-600">
                LIVE
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center space-y-3">
            <p className="text-muted-foreground">
              with {data.activeSession.trainer.user.firstName}{' '}
              {data.activeSession.trainer.user.lastName}
            </p>
            <SessionTimer
              startedAt={data.activeSession.startedAt}
              expectedDurationMin={data.activeSession.durationMin}
              size="lg"
            />
          </CardContent>
        </Card>
      )}

      {/* Session count cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/15 p-2">
                <Dumbbell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data.sessionCount.used}</p>
                <p className="text-xs text-muted-foreground">Used</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/15 p-2">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data.sessionCount.remaining}</p>
                <p className="text-xs text-muted-foreground">Remaining</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data.sessionCount.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">{data.sessionCount.carryForward}</p>
                <p className="text-xs text-muted-foreground">Carry Fwd</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Next session and trainer info */}
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Next Session */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Next Session
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.nextSession ? (
              <div className="space-y-1">
                <p className="text-lg font-semibold">
                  {formatDate(data.nextSession.scheduledDate)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {data.nextSession.scheduledTime} &middot; {data.nextSession.durationMin} min
                </p>
                <p className="text-sm">
                  with {data.nextSession.trainer.user.firstName}{' '}
                  {data.nextSession.trainer.user.lastName}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No upcoming sessions scheduled.</p>
            )}
          </CardContent>
        </Card>

        {/* Trainer Info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Your Trainer
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.trainer ? (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-semibold">{data.trainer.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {data.trainer.sessionsPerMonth} sessions/month
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No trainer assigned yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Session breakdown */}
      {data.sessionCount.noShow > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              <Badge variant="destructive">{data.sessionCount.noShow}</Badge>
              <span className="text-sm text-muted-foreground">
                no-show session{data.sessionCount.noShow > 1 ? 's' : ''} this month (counted as
                used)
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
