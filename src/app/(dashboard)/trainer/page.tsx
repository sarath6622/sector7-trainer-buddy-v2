'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Square, UserX, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SessionTimer } from '@/components/timer/SessionTimer';
import { WorkoutLogger } from '@/components/workout/WorkoutLogger';

interface SessionData {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  status: string;
  startedAt?: string;
  client: {
    id: string;
    user: { firstName: string; lastName: string };
  };
  trainer: {
    user: { firstName: string; lastName: string };
  };
  workoutLogs?: {
    id: string;
    exerciseId: string;
    orderIndex: number;
    exercise: { id: string; name: string; targetMuscleGroup: string; category: string };
    sets: {
      setNumber: number;
      reps: number | null;
      weightKg: number | null;
      durationSec: number | null;
      rpe: number | null;
      notes: string | null;
    }[];
  }[];
}

export default function TrainerDashboard() {
  const { confirm, ConfirmDialog } = useConfirm();
  const router = useRouter();
  const [todaySessions, setTodaySessions] = useState<SessionData[]>([]);
  const [activeSession, setActiveSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchTodaySessions = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch(`/api/trainer/schedule?date=${today}`);
      if (res.ok) {
        const { data } = await res.json();
        setTodaySessions(data);
        const active = data.find((s: SessionData) => s.status === 'IN_PROGRESS');
        if (active) {
          // Fetch full session details with workout logs
          const detailRes = await fetch(`/api/trainer/sessions/${active.id}`);
          if (detailRes.ok) {
            const { data: detail } = await detailRes.json();
            setActiveSession(detail);
          } else {
            setActiveSession(active);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTodaySessions();
  }, [fetchTodaySessions]);

  async function handleStartSession(sessionId: string) {
    setActionLoading(sessionId);
    try {
      const res = await fetch(`/api/trainer/sessions/${sessionId}/start`, { method: 'POST' });
      if (res.ok) {
        const { data } = await res.json();
        setActiveSession(data.session);
        fetchTodaySessions();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to start session');
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleEndSession(sessionId: string) {
    const ok = await confirm({
      title: 'End Session',
      description: 'Are you sure you want to end this session?',
      confirmText: 'End Session',
      variant: 'destructive',
    });
    if (!ok) return;
    setActionLoading(sessionId);
    try {
      const res = await fetch(`/api/trainer/sessions/${sessionId}/end`, { method: 'POST' });
      if (res.ok) {
        setActiveSession(null);
        fetchTodaySessions();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to end session');
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleNoShow(sessionId: string) {
    const ok = await confirm({
      title: 'Mark No-Show',
      description: 'Mark this client as no-show? This counts as a used session.',
      confirmText: 'Mark No-Show',
      variant: 'destructive',
    });
    if (!ok) return;
    setActionLoading(sessionId);
    try {
      const res = await fetch(`/api/trainer/sessions/${sessionId}/no-show`, { method: 'POST' });
      if (res.ok) {
        fetchTodaySessions();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to mark no-show');
      }
    } finally {
      setActionLoading(null);
    }
  }

  const statusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      SCHEDULED: 'outline',
      IN_PROGRESS: 'default',
      COMPLETED: 'secondary',
      NO_SHOW: 'destructive',
      CANCELLED: 'secondary',
    };
    return <Badge variant={variants[status] ?? 'outline'}>{status.replace('_', ' ')}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Trainer Dashboard</h1>

      {/* Active Session Card */}
      {activeSession && activeSession.startedAt && (
        <Card className="border-primary/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Active Session</CardTitle>
              <Badge variant="default" className="bg-green-600">
                LIVE
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col items-center">
              <p className="mb-2 text-lg font-semibold">
                {activeSession.client.user.firstName} {activeSession.client.user.lastName}
              </p>
              <SessionTimer
                startedAt={activeSession.startedAt}
                expectedDurationMin={activeSession.durationMin}
                size="lg"
              />
            </div>
            {/* Workout Logger */}
            <WorkoutLogger
              sessionInstanceId={activeSession.id}
              existingLogs={activeSession.workoutLogs}
            />

            <Button
              variant="destructive"
              className="w-full"
              onClick={() => handleEndSession(activeSession.id)}
              disabled={actionLoading === activeSession.id}
            >
              <Square className="mr-2 h-4 w-4" />
              {actionLoading === activeSession.id ? 'Ending...' : 'End Session'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Today's Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Today&apos;s Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todaySessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions scheduled for today.</p>
          ) : (
            <div className="space-y-3">
              {todaySessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 p-3"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {session.client.user.firstName} {session.client.user.lastName}
                      </p>
                      {statusBadge(session.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {session.scheduledTime} &middot; {session.durationMin} min
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {session.status === 'SCHEDULED' && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleStartSession(session.id)}
                          disabled={!!activeSession || actionLoading === session.id}
                          className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                        >
                          <Play className="mr-1 h-3 w-3" />
                          {actionLoading === session.id ? '...' : 'Start'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleNoShow(session.id)}
                          disabled={actionLoading === session.id}
                        >
                          <UserX className="mr-1 h-3 w-3" />
                          No Show
                        </Button>
                      </>
                    )}
                    {session.status === 'COMPLETED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => router.push(`/trainer/sessions/${session.id}`)}
                      >
                        View
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {ConfirmDialog}
    </div>
  );
}
