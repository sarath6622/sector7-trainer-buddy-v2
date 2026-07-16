'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  AlarmClock,
  CalendarClock,
  Dumbbell,
  Mail,
  Phone,
  StickyNote,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePickerModal } from '@/components/ui/date-picker-modal';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatClock, formatDayHeading, formatTime12 } from '@/lib/sessionStatsLabel';
import { overrunMinutes } from '@/lib/sessionOverrun';

interface WorkoutSet {
  id: string;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
}

interface WorkoutLog {
  id: string;
  exercise: { id: string; name: string; targetMuscleGroup: string };
  sets: WorkoutSet[];
}

export interface SessionDetail {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  actualDurationMin: number | null;
  notes: string | null;
  trainerProfileId: string;
  client: {
    id: string;
    user: { firstName: string; lastName: string; email: string; phone: string | null };
  };
  trainer: {
    id: string;
    user: { firstName: string; lastName: string };
  };
  workoutLogs: WorkoutLog[];
}

interface TrainerOption {
  id: string;
  name: string;
}

const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/20',
  IN_PROGRESS: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20',
  COMPLETED: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20',
  NO_SHOW: 'bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20',
  CANCELLED: 'bg-zinc-500/10 text-zinc-500 ring-zinc-500/20',
};

function sectionLabel(text: string) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {text}
    </p>
  );
}

/**
 * Right-side drawer with the full detail of one session: people, timeline,
 * logged workout, notes — plus reschedule + cancel actions while the session
 * is still SCHEDULED (the only status the admin API allows mutating).
 */
export function SessionDetailSheet({
  sessionId,
  trainers,
  onOpenChange,
  onChanged,
}: {
  sessionId: string | null;
  trainers: TrainerOption[];
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editTrainer, setEditTrainer] = useState('');

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/sessions/${id}`);
      if (!res.ok) return;
      const { data } = await res.json();
      setDetail(data);
      setEditDate(data.scheduledDate.slice(0, 10));
      setEditTime(data.scheduledTime);
      setEditTrainer(data.trainerProfileId);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setDetail(null);
    setEditing(false);
    setConfirmCancel(false);
    if (sessionId) loadDetail(sessionId);
  }, [sessionId, loadDetail]);

  const saveReschedule = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (editDate !== detail.scheduledDate.slice(0, 10)) body.scheduledDate = editDate;
      if (editTime !== detail.scheduledTime) body.scheduledTime = editTime;
      if (editTrainer !== detail.trainerProfileId) body.trainerProfileId = editTrainer;
      if (Object.keys(body).length === 0) {
        setEditing(false);
        return;
      }
      const res = await fetch(`/api/admin/sessions/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? 'Could not update the session');
        return;
      }
      toast.success('Session updated — client & trainer notified');
      setEditing(false);
      await loadDetail(detail.id);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const cancelSession = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/sessions/${detail.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? 'Could not cancel the session');
        return;
      }
      toast.success('Session cancelled — client & trainer notified');
      onOpenChange(false);
      onChanged();
    } finally {
      setSaving(false);
      setConfirmCancel(false);
    }
  };

  const totalVolume =
    detail?.workoutLogs.reduce(
      (sum, log) =>
        sum + log.sets.reduce((s, set) => s + (set.weightKg ?? 0) * (set.reps ?? 0), 0),
      0,
    ) ?? 0;

  const overrun = detail?.status === 'IN_PROGRESS' ? overrunMinutes(detail.startedAt, detail.durationMin) : 0;

  return (
    <Sheet open={!!sessionId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {loading || !detail ? (
          <div className="space-y-4 p-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          <>
            <SheetHeader className="border-b border-border/50 pb-4 pr-12">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-lg font-bold">
                  {detail.client.user.firstName} {detail.client.user.lastName}
                </SheetTitle>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[11px] ring-1',
                    STATUS_BADGE[detail.status] ?? STATUS_BADGE.SCHEDULED,
                  )}
                >
                  {detail.status.replace('_', ' ')}
                </Badge>
              </div>
              <SheetDescription>
                {formatDayHeading(detail.scheduledDate)} · {formatTime12(detail.scheduledTime)} ·{' '}
                {detail.durationMin}min with {detail.trainer.user.firstName}{' '}
                {detail.trainer.user.lastName}
              </SheetDescription>
              {overrun > 0 && (
                <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                  <AlarmClock className="h-3.5 w-3.5" />
                  Running {overrun} min over the planned duration
                </p>
              )}
            </SheetHeader>

            <div className="space-y-5 p-4">
              {/* People */}
              <div className="space-y-2">
                {sectionLabel('Contact')}
                <div className="space-y-1.5 rounded-xl bg-muted/40 p-3 text-sm">
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{detail.client.user.email}</span>
                  </p>
                  {detail.client.user.phone && (
                    <p className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      {detail.client.user.phone}
                    </p>
                  )}
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    Trainer: {detail.trainer.user.firstName} {detail.trainer.user.lastName}
                  </p>
                </div>
              </div>

              {/* Timeline */}
              {(detail.startedAt || detail.endedAt) && (
                <div className="space-y-2">
                  {sectionLabel('Timeline')}
                  <div className="space-y-1.5 rounded-xl bg-muted/40 p-3 text-sm">
                    {detail.startedAt && (
                      <p className="flex items-center justify-between">
                        <span className="text-muted-foreground">Started</span>
                        <span className="font-medium">{formatClock(detail.startedAt)}</span>
                      </p>
                    )}
                    {detail.endedAt && (
                      <p className="flex items-center justify-between">
                        <span className="text-muted-foreground">Ended</span>
                        <span className="font-medium">{formatClock(detail.endedAt)}</span>
                      </p>
                    )}
                    {detail.actualDurationMin !== null && (
                      <p className="flex items-center justify-between">
                        <span className="text-muted-foreground">Actual duration</span>
                        <span className="font-medium">
                          {detail.actualDurationMin}min{' '}
                          <span className="text-xs text-muted-foreground">
                            (planned {detail.durationMin})
                          </span>
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Workout */}
              {detail.workoutLogs.length > 0 && (
                <div className="space-y-2">
                  {sectionLabel(
                    `Workout · ${detail.workoutLogs.length} exercise${detail.workoutLogs.length !== 1 ? 's' : ''}${totalVolume > 0 ? ` · ${Math.round(totalVolume).toLocaleString('en-IN')}kg volume` : ''}`,
                  )}
                  <div className="space-y-1.5">
                    {detail.workoutLogs.map((log) => {
                      const volume = log.sets.reduce(
                        (s, set) => s + (set.weightKg ?? 0) * (set.reps ?? 0),
                        0,
                      );
                      return (
                        <div
                          key={log.id}
                          className="flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <Dumbbell className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{log.exercise.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {log.exercise.targetMuscleGroup} · {log.sets.length} set
                              {log.sets.length !== 1 ? 's' : ''}
                              {volume > 0 &&
                                ` · ${Math.round(volume).toLocaleString('en-IN')}kg`}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes */}
              {detail.notes && (
                <div className="space-y-2">
                  {sectionLabel('Notes')}
                  <p className="flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
                    <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {detail.notes}
                  </p>
                </div>
              )}

              {/* Actions — only SCHEDULED sessions can be edited or cancelled */}
              {detail.status === 'SCHEDULED' && (
                <div className="space-y-3 border-t border-border/50 pt-4">
                  {!editing ? (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="h-10 flex-1 gap-2"
                        onClick={() => setEditing(true)}
                      >
                        <CalendarClock className="h-4 w-4" />
                        Reschedule
                      </Button>
                      {confirmCancel ? (
                        <Button
                          variant="destructive"
                          className="h-10 flex-1"
                          disabled={saving}
                          onClick={cancelSession}
                        >
                          {saving ? 'Cancelling…' : 'Confirm cancel'}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="h-10 flex-1 text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                          onClick={() => setConfirmCancel(true)}
                        >
                          Cancel session
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-xl bg-muted/40 p-3">
                      {sectionLabel('Reschedule')}
                      <div className="grid grid-cols-2 gap-2">
                        <DatePickerModal value={editDate} onChange={setEditDate} className="h-10" />
                        <Input
                          type="time"
                          value={editTime}
                          onChange={(e) => setEditTime(e.target.value)}
                          className="h-10"
                        />
                      </div>
                      <select
                        value={editTrainer}
                        onChange={(e) => setEditTrainer(e.target.value)}
                        className="block h-10 w-full rounded-lg border border-border/50 bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {trainers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <Button
                          className="h-10 flex-1"
                          disabled={saving}
                          onClick={saveReschedule}
                        >
                          {saving ? 'Saving…' : 'Save changes'}
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-10"
                          disabled={saving}
                          onClick={() => setEditing(false)}
                        >
                          Discard
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Client and trainer are notified automatically.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
