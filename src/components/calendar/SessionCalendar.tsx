'use client';

import { useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventInput, EventClickArg, DateSelectArg } from '@fullcalendar/core';

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: '#3b82f6', // blue
  IN_PROGRESS: '#f59e0b', // amber
  COMPLETED: '#22c55e', // green
  NO_SHOW: '#ef4444', // red
  CANCELLED: '#9ca3af', // gray
};

interface SessionCalendarProps {
  events: EventInput[];
  onEventClick?: (info: EventClickArg) => void;
  onDateSelect?: (info: DateSelectArg) => void;
  selectable?: boolean;
  initialView?: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';
  height?: string | number;
}

export function SessionCalendar({
  events,
  onEventClick,
  onDateSelect,
  selectable = false,
  initialView = 'dayGridMonth',
  height = 'auto',
}: SessionCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null);

  const coloredEvents = events.map((event) => ({
    ...event,
    backgroundColor:
      event.backgroundColor ??
      STATUS_COLORS[event.extendedProps?.status as string] ??
      STATUS_COLORS.SCHEDULED,
    borderColor: 'transparent',
  }));

  return (
    <FullCalendar
      ref={calendarRef}
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
      initialView={initialView}
      headerToolbar={{
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay',
      }}
      events={coloredEvents}
      eventClick={onEventClick}
      selectable={selectable}
      select={onDateSelect}
      height={height}
      slotMinTime="05:00:00"
      slotMaxTime="22:00:00"
      allDaySlot={false}
      eventTimeFormat={{
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }}
      slotLabelFormat={{
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }}
      nowIndicator
      dayMaxEvents={3}
    />
  );
}
