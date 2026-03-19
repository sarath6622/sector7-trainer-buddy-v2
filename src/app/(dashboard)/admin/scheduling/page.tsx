'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SessionCalendar } from '@/components/calendar/SessionCalendar';
import { AlertTriangle, CalendarPlus, Loader2, Plus, X } from 'lucide-react';
import type { EventInput, EventClickArg } from '@fullcalendar/core';

interface Schedule {
  id: string;
  dayOfWeek: string;
  startTime: string;
  durationMin: number;
  isActive: boolean;
  validFrom: string;
  validUntil: string | null;
  client: { user: { firstName: string; lastName: string } };
  trainer: { user: { firstName: string; lastName: string } };
}

interface SessionInstance {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  status: string;
  client: { user: { firstName: string; lastName: string } };
  trainer: { user: { firstName: string; lastName: string } };
}

interface Conflict {
  sessionA: { id: string; scheduledDate: string; scheduledTime: string; clientName: string };
  sessionB: { id: string; scheduledDate: string; scheduledTime: string; clientName: string };
  trainerName: string;
  overlapMinutes: number;
}

interface TrainerOption {
  id: string;
  firstName: string;
  lastName: string;
  trainerProfile: { id: string } | null;
}

interface ClientOption {
  id: string;
  firstName: string;
  lastName: string;
  clientProfile: { id: string } | null;
}

const DAYS_OF_WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export default function SchedulingPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [sessions, setSessions] = useState<SessionInstance[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedSession, setSelectedSession] = useState<SessionInstance | null>(null);

  // Generate month (default: current month)
  const [generateMonth, setGenerateMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Create schedule form
  const [form, setForm] = useState({
    trainerProfileId: '',
    clientProfileId: '',
    dayOfWeek: 'MONDAY',
    startTime: '07:00',
    durationMin: '60',
    validFrom: new Date().toISOString().split('T')[0],
    validUntil: '',
  });
  const [formError, setFormError] = useState('');
  const [formSaving, setFormSaving] = useState(false);

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/schedules');
      if (res.ok) {
        const { data } = await res.json();
        setSchedules(data);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/sessions?pageSize=100');
      if (res.ok) {
        const json = await res.json();
        setSessions(json.data ?? []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const fetchTrainersAndClients = useCallback(async () => {
    try {
      const [tRes, cRes] = await Promise.all([
        fetch('/api/admin/users?role=TRAINER&pageSize=100'),
        fetch('/api/admin/users?role=CLIENT&pageSize=100'),
      ]);
      if (tRes.ok) {
        const { data } = await tRes.json();
        setTrainers(data);
      }
      if (cRes.ok) {
        const { data } = await cRes.json();
        setClients(data);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchSchedules(), fetchSessions(), fetchTrainersAndClients()]).finally(() =>
      setLoading(false),
    );
  }, [fetchSchedules, fetchSessions, fetchTrainersAndClients]);

  async function handleCreateSchedule() {
    if (!form.trainerProfileId || !form.clientProfileId) {
      setFormError('Select both a trainer and a client');
      return;
    }
    setFormSaving(true);
    setFormError('');
    try {
      const res = await fetch('/api/admin/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainerProfileId: form.trainerProfileId,
          clientProfileId: form.clientProfileId,
          dayOfWeek: form.dayOfWeek,
          startTime: form.startTime,
          durationMin: parseInt(form.durationMin, 10),
          validFrom: form.validFrom,
          validUntil: form.validUntil || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setFormError(data.error ?? 'Failed to create schedule');
      } else {
        setShowCreateForm(false);
        setForm({
          trainerProfileId: '',
          clientProfileId: '',
          dayOfWeek: 'MONDAY',
          startTime: '07:00',
          durationMin: '60',
          validFrom: new Date().toISOString().split('T')[0],
          validUntil: '',
        });
        await fetchSchedules();
      }
    } catch {
      setFormError('Failed to create schedule');
    } finally {
      setFormSaving(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setConflicts([]);
    try {
      const res = await fetch('/api/admin/schedules/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: generateMonth }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setConflicts(data.conflicts);
        await fetchSessions();
        alert(`Generated ${data.created} sessions. ${data.conflicts.length} conflicts found.`);
      }
    } catch {
      alert('Failed to generate sessions');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDeleteSchedule(scheduleId: string) {
    if (!confirm('Deactivate this recurring schedule?')) return;
    try {
      await fetch(`/api/admin/schedules/${scheduleId}`, { method: 'DELETE' });
      await fetchSchedules();
    } catch {
      /* ignore */
    }
  }

  function handleEventClick(info: EventClickArg) {
    const session = sessions.find((s) => s.id === info.event.id);
    setSelectedSession(session ?? null);
  }

  // Convert sessions to calendar events
  const calendarEvents: EventInput[] = sessions.map((s) => {
    const [h, m] = s.scheduledTime.split(':').map(Number);
    const start = new Date(s.scheduledDate);
    start.setHours(h!, m!, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + s.durationMin);

    return {
      id: s.id,
      title: `${s.client.user.firstName} ${s.client.user.lastName} — ${s.trainer.user.firstName}`,
      start,
      end,
      extendedProps: { status: s.status },
    };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Scheduling</h1>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? <X className="mr-1 h-4 w-4" /> : <Plus className="mr-1 h-4 w-4" />}
            {showCreateForm ? 'Cancel' : 'New Schedule'}
          </Button>
        </div>
      </div>

      {/* Create Schedule Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create Recurring Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label>Trainer</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.trainerProfileId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, trainerProfileId: e.target.value }))
                  }
                >
                  <option value="">Select trainer</option>
                  {trainers
                    .filter((t) => t.trainerProfile)
                    .map((t) => (
                      <option key={t.trainerProfile!.id} value={t.trainerProfile!.id}>
                        {t.firstName} {t.lastName}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Client</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.clientProfileId}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, clientProfileId: e.target.value }))
                  }
                >
                  <option value="">Select client</option>
                  {clients
                    .filter((c) => c.clientProfile)
                    .map((c) => (
                      <option key={c.clientProfile!.id} value={c.clientProfile!.id}>
                        {c.firstName} {c.lastName}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Day of Week</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                  value={form.dayOfWeek}
                  onChange={(e) => setForm((prev) => ({ ...prev, dayOfWeek: e.target.value }))}
                >
                  {DAYS_OF_WEEK.map((day) => (
                    <option key={day} value={day}>
                      {day.charAt(0) + day.slice(1).toLowerCase()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Duration (min)</Label>
                <Input
                  type="number"
                  min="15"
                  step="15"
                  value={form.durationMin}
                  onChange={(e) => setForm((prev) => ({ ...prev, durationMin: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Valid From</Label>
                <Input
                  type="date"
                  value={form.validFrom}
                  onChange={(e) => setForm((prev) => ({ ...prev, validFrom: e.target.value }))}
                />
              </div>
            </div>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <Button onClick={handleCreateSchedule} disabled={formSaving}>
              {formSaving ? 'Creating...' : 'Create Schedule'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Generate Sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5" />
            Generate Monthly Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Month</Label>
              <Input
                type="month"
                value={generateMonth}
                onChange={(e) => setGenerateMonth(e.target.value)}
              />
            </div>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Sessions'
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Scheduling Conflicts ({conflicts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {conflicts.map((c, i) => (
              <div key={i} className="rounded border p-3 text-sm">
                <p className="font-medium">{c.trainerName}</p>
                <p className="text-muted-foreground">
                  {c.sessionA.clientName} ({c.sessionA.scheduledTime}) overlaps with{' '}
                  {c.sessionB.clientName} ({c.sessionB.scheduledTime}) — {c.overlapMinutes}min
                  overlap
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Calendar */}
      <Card>
        <CardContent className="pt-6">
          <SessionCalendar events={calendarEvents} onEventClick={handleEventClick} height={600} />
        </CardContent>
      </Card>

      {/* Selected Session Detail */}
      {selectedSession && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Session Details</CardTitle>
            <Button variant="ghost" size="icon" onClick={() => setSelectedSession(null)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-sm text-muted-foreground">Client</p>
                <p className="font-medium">
                  {selectedSession.client.user.firstName} {selectedSession.client.user.lastName}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Trainer</p>
                <p className="font-medium">
                  {selectedSession.trainer.user.firstName} {selectedSession.trainer.user.lastName}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date & Time</p>
                <p className="font-medium">
                  {new Date(selectedSession.scheduledDate).toLocaleDateString()} at{' '}
                  {selectedSession.scheduledTime}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={selectedSession.status === 'COMPLETED' ? 'default' : 'secondary'}>
                  {selectedSession.status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recurring Schedules List */}
      <Card>
        <CardHeader>
          <CardTitle>Recurring Schedules</CardTitle>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recurring schedules yet.</p>
          ) : (
            <div className="space-y-2">
              {schedules.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {s.client.user.firstName} {s.client.user.lastName}
                      </span>
                      <span className="text-muted-foreground">with</span>
                      <span className="font-medium">
                        {s.trainer.user.firstName} {s.trainer.user.lastName}
                      </span>
                      <Badge variant={s.isActive ? 'default' : 'secondary'}>
                        {s.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {s.dayOfWeek.charAt(0) + s.dayOfWeek.slice(1).toLowerCase()} at {s.startTime}{' '}
                      ({s.durationMin} min)
                    </p>
                  </div>
                  {s.isActive && (
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteSchedule(s.id)}>
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
