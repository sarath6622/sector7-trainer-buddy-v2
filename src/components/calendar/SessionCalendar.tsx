'use client';

import { useEffect, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventInput, EventClickArg, DateSelectArg, DatesSetArg } from '@fullcalendar/core';

// Pastel backgrounds with strong accent border
const STATUS_STYLES: Record<string, { bg: string; accent: string; label: string }> = {
  SCHEDULED: { bg: '#dbeafe', accent: '#3b82f6', label: 'Scheduled' },
  IN_PROGRESS: { bg: '#fef3c7', accent: '#f59e0b', label: 'In Progress' },
  COMPLETED: { bg: '#dcfce7', accent: '#22c55e', label: 'Completed' },
  NO_SHOW: { bg: '#fde2e2', accent: '#ef4444', label: 'No Show' },
  CANCELLED: { bg: '#f3f4f6', accent: '#9ca3af', label: 'Cancelled' },
};

// Dark mode pastels
const STATUS_STYLES_DARK: Record<string, { bg: string; accent: string }> = {
  SCHEDULED: { bg: 'rgba(59,130,246,0.15)', accent: '#60a5fa' },
  IN_PROGRESS: { bg: 'rgba(245,158,11,0.15)', accent: '#fbbf24' },
  COMPLETED: { bg: 'rgba(34,197,94,0.15)', accent: '#4ade80' },
  NO_SHOW: { bg: 'rgba(239,68,68,0.15)', accent: '#f87171' },
  CANCELLED: { bg: 'rgba(156,163,175,0.12)', accent: '#9ca3af' },
};

const STATUS_LABELS = Object.entries(STATUS_STYLES).map(([key, val]) => ({
  key,
  label: val.label,
  accent: val.accent,
}));

interface SessionCalendarProps {
  events: EventInput[];
  onEventClick?: (info: EventClickArg) => void;
  onDateSelect?: (info: DateSelectArg) => void;
  selectable?: boolean;
  initialView?: 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay';
  height?: string | number;
  showLegend?: boolean;
  /** Optional React node rendered on the left side of the legend row */
  filterSlot?: React.ReactNode;
  onDatesSet?: (info: DatesSetArg) => void;
}

export function SessionCalendar({
  events,
  onEventClick,
  onDateSelect,
  selectable = false,
  initialView = 'timeGridWeek',
  height = 'auto',
  showLegend = true,
  filterSlot,
  onDatesSet,
}: SessionCalendarProps) {
  const calendarRef = useRef<FullCalendar>(null);

  // Responsive: day view on mobile, provided initialView on desktop
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const handler = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      const api = calendarRef.current?.getApi();
      if (api) api.changeView(e.matches ? 'timeGridDay' : initialView);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [initialView]);

  const resolvedView = isMobile ? 'timeGridDay' : initialView;

  // Detect dark mode on client
  const isDark =
    typeof window !== 'undefined' && document.documentElement.classList.contains('dark');

  const coloredEvents = events.map((event) => {
    const status = (event.extendedProps?.status as string) ?? 'SCHEDULED';
    const light = STATUS_STYLES[status] ?? STATUS_STYLES.SCHEDULED!;
    const dark = STATUS_STYLES_DARK[status] ?? STATUS_STYLES_DARK.SCHEDULED!;
    const styles = isDark ? dark : light;

    return {
      ...event,
      backgroundColor: event.backgroundColor ?? styles.bg,
      borderColor: styles.accent,
      textColor: 'inherit',
      // Pass accent color as CSS variable via classNames
      extendedProps: {
        ...event.extendedProps,
        accentColor: styles.accent,
      },
    };
  });

  return (
    <div className="space-y-4">
      {(showLegend || filterSlot) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-muted/40 px-4 py-2.5">
          {filterSlot}
          {filterSlot && showLegend && <div className="ml-auto" />}
          {showLegend && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {STATUS_LABELS.map((s) => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: s.accent }}
                  />
                  <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={resolvedView}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        events={coloredEvents}
        eventClick={onEventClick}
        selectable={selectable}
        select={onDateSelect}
        datesSet={onDatesSet}
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
        eventDisplay="block"
        eventDidMount={(info) => {
          // Set accent color CSS variable for left border
          const accent = info.event.extendedProps?.accentColor as string | undefined;
          if (accent) {
            info.el.style.setProperty('--fc-event-accent', accent);
            info.el.style.borderLeftColor = accent;
          }
        }}
      />
    </div>
  );
}
