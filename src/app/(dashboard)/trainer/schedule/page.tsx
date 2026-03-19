'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SessionCalendar } from '@/components/calendar/SessionCalendar';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { EventInput, EventClickArg } from '@fullcalendar/core';

interface SessionInstance {
  id: string;
  scheduledDate: string;
  scheduledTime: string;
  durationMin: number;
  status: string;
  client: { user: { firstName: string; lastName: string } };
}

export default function TrainerSchedulePage() {
  const [sessions, setSessions] = useState<SessionInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SessionInstance | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/trainer/schedule');
      if (res.ok) {
        const { data } = await res.json();
        setSessions(data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  function handleEventClick(info: EventClickArg) {
    const session = sessions.find((s) => s.id === info.event.id);
    setSelected(session ?? null);
  }

  const calendarEvents: EventInput[] = sessions.map((s) => {
    const [h, m] = s.scheduledTime.split(':').map(Number);
    const start = new Date(s.scheduledDate);
    start.setHours(h!, m!, 0);
    const end = new Date(start);
    end.setMinutes(end.getMinutes() + s.durationMin);

    return {
      id: s.id,
      title: `${s.client.user.firstName} ${s.client.user.lastName}`,
      start,
      end,
      extendedProps: { status: s.status },
    };
  });

  if (loading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Schedule</h1>

      <Card>
        <CardContent className="pt-6">
          <SessionCalendar
            events={calendarEvents}
            onEventClick={handleEventClick}
            initialView="timeGridWeek"
            height={600}
          />
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Session Details</h3>
              <Button variant="ghost" size="icon" onClick={() => setSelected(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Client</p>
                <p className="font-medium">
                  {selected.client.user.firstName} {selected.client.user.lastName}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date & Time</p>
                <p className="font-medium">
                  {new Date(selected.scheduledDate).toLocaleDateString()} at{' '}
                  {selected.scheduledTime}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={selected.status === 'COMPLETED' ? 'default' : 'secondary'}>
                  {selected.status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
