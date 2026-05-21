'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type {
  EventInput,
  EventClickArg,
  DateSelectArg,
  DatesSetArg,
  DayHeaderContentArg,
} from '@fullcalendar/core';

// Pastel backgrounds with strong accent border
const STATUS_STYLES: Record<string, { bg: string; accent: string; label: string }> = {
  SCHEDULED: { bg: '#dbeafe', accent: '#3b82f6', label: 'Scheduled' },
  IN_PROGRESS: { bg: '#fef3c7', accent: '#f59e0b', label: 'In Progress' },
  COMPLETED: { bg: '#dcfce7', accent: '#22c55e', label: 'Completed' },
  NO_SHOW: { bg: '#fde2e2', accent: '#ef4444', label: 'No Show' },
  CANCELLED: { bg: '#f3f4f6', accent: '#9ca3af', label: 'Cancelled' },
  CROSSFIT: { bg: '#ffedd5', accent: '#f97316', label: 'CrossFit' },
};

// Dark mode pastels
const STATUS_STYLES_DARK: Record<string, { bg: string; accent: string }> = {
  SCHEDULED: { bg: 'rgba(59,130,246,0.15)', accent: '#60a5fa' },
  IN_PROGRESS: { bg: 'rgba(245,158,11,0.15)', accent: '#fbbf24' },
  COMPLETED: { bg: 'rgba(34,197,94,0.15)', accent: '#4ade80' },
  NO_SHOW: { bg: 'rgba(239,68,68,0.15)', accent: '#f87171' },
  CANCELLED: { bg: 'rgba(156,163,175,0.12)', accent: '#9ca3af' },
  CROSSFIT: { bg: 'rgba(249,115,22,0.15)', accent: '#fb923c' },
};

const STATUS_LABELS = Object.entries(STATUS_STYLES).map(([key, val]) => ({
  key,
  label: val.label,
  accent: val.accent,
}));

const OVERFLOW_ACCENT = '#64748b';
const OVERFLOW_BG_LIGHT = '#e2e8f0';
const OVERFLOW_BG_DARK = 'rgba(100,116,139,0.25)';

const OVERFLOW_PREFIX = '__overflow__:';

function toDate(value: EventInput['start']): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Detect clusters of overlapping events per day. When a cluster has more than
 * `visibleCount` events, hide the overflow behind a single "+N more" chip.
 * Returns the events to render plus the overflow-chip metadata.
 */
function compactOverlappingEvents(
  events: EventInput[],
  visibleCount: number,
): { rendered: EventInput[]; overflowMap: Map<string, EventInput[]> } {
  const overflowMap = new Map<string, EventInput[]>();
  if (events.length === 0) return { rendered: events, overflowMap };

  // Bucket by local day for cheap clustering — sessions never cross midnight here.
  const byDay = new Map<string, { event: EventInput; start: Date; end: Date }[]>();
  const passthrough: EventInput[] = [];

  for (const ev of events) {
    const start = toDate(ev.start);
    const end = toDate(ev.end) ?? (start ? new Date(start.getTime() + 30 * 60_000) : null);
    if (!start || !end) {
      passthrough.push(ev);
      continue;
    }
    const key = dayKey(start);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push({ event: ev, start, end });
  }

  const rendered: EventInput[] = [...passthrough];

  for (const [key, items] of byDay) {
    items.sort((a, b) => a.start.getTime() - b.start.getTime());

    // Sweep to find clusters: a new cluster starts when the next event begins
    // after the current cluster's running end.
    let cluster: typeof items = [];
    let runningEnd = -Infinity;

    const flush = () => {
      if (cluster.length === 0) return;
      if (cluster.length <= visibleCount) {
        rendered.push(...cluster.map((c) => c.event));
      } else {
        const visible = cluster.slice(0, visibleCount);
        const hidden = cluster.slice(visibleCount);
        rendered.push(...visible.map((c) => c.event));

        const overflowId = `${OVERFLOW_PREFIX}${key}:${visible[visible.length - 1]!.start.toISOString()}`;
        const overflowStart = hidden[0]!.start;
        const overflowEnd = hidden.reduce((max, c) => (c.end > max ? c.end : max), hidden[0]!.end);
        // Dialog shows EVERY session in the cluster (not just the hidden ones)
        // so admins can see the full slot — including the cards already visible
        // on the grid — in one consistent list.
        overflowMap.set(
          overflowId,
          cluster.map((c) => c.event),
        );
        rendered.push({
          id: overflowId,
          title: `View all ${cluster.length}`,
          start: overflowStart,
          end: overflowEnd,
          extendedProps: {
            isOverflow: true,
            overflowCount: cluster.length,
            overflowId,
          },
        });
      }
      cluster = [];
    };

    for (const item of items) {
      if (item.start.getTime() >= runningEnd) {
        flush();
        cluster = [item];
        runningEnd = item.end.getTime();
      } else {
        cluster.push(item);
        if (item.end.getTime() > runningEnd) runningEnd = item.end.getTime();
      }
    }
    flush();
  }

  return { rendered, overflowMap };
}

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
  /**
   * Cap visible cards per overlapping cluster. Extras collapse into a
   * "+N more" chip. Defaults: 3 on desktop, 2 on mobile (≤640px).
   */
  overflowVisibleCount?: number;
  /**
   * Fires when the user taps a "+N more" overflow chip. Receives the list of
   * hidden events for that slot so the parent can render a popover/dialog.
   */
  onOverflowClick?: (hidden: EventInput[]) => void;
  /** When provided, the FC toolbar title becomes tappable (e.g. to open a date picker). */
  onTitleClick?: () => void;
  /** Replace the day-view column header with a "N sessions · Xh" summary chip. */
  showDaySummary?: boolean;
  /** On mount/date change, scroll the time grid so "now" sits near the top. */
  scrollToCurrentTime?: boolean;
}

export interface SessionCalendarHandle {
  gotoDate: (date: Date) => void;
}

export const SessionCalendar = forwardRef<SessionCalendarHandle, SessionCalendarProps>(
  function SessionCalendar(
    {
      events,
      onEventClick,
      onDateSelect,
      selectable = false,
      initialView = 'timeGridWeek',
      height = 'auto',
      showLegend = true,
      filterSlot,
      onDatesSet,
      overflowVisibleCount,
      onOverflowClick,
      onTitleClick,
      showDaySummary,
      scrollToCurrentTime,
    },
    handleRef,
  ) {
    const calendarRef = useRef<FullCalendar>(null);

    useImperativeHandle(handleRef, () => ({
      gotoDate: (date: Date) => calendarRef.current?.getApi().gotoDate(date),
    }));

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

    // Track the active FullCalendar view so the overflow threshold adapts when
    // the user clicks month/week/day in the toolbar.
    const [currentView, setCurrentView] = useState<string>(resolvedView);

    // Detect dark mode on client
    const isDark =
      typeof window !== 'undefined' && document.documentElement.classList.contains('dark');

    // View-aware defaults. Week columns are narrow → 1 visible card + "View all".
    // Day view has the full grid width → 2 cards fit comfortably. Mobile mirrors
    // week's tight budget. Month view skips clustering entirely (FullCalendar's
    // dayMaxEvents handles spillover there).
    const visibleCount =
      overflowVisibleCount ??
      (isMobile ? 1 : currentView === 'timeGridWeek' ? 1 : currentView === 'timeGridDay' ? 2 : 3);

    const clusteringEnabled = !!onOverflowClick && currentView !== 'dayGridMonth';

    // Cluster + collapse overlapping events first, then colour. Only opt in when
    // the caller wires up `onOverflowClick` — otherwise the "+N more" chip would
    // be dead, so we keep FullCalendar's default side-by-side layout.
    const { rendered, overflowMap } = useMemo(
      () =>
        clusteringEnabled
          ? compactOverlappingEvents(events, visibleCount)
          : { rendered: events, overflowMap: new Map<string, EventInput[]>() },
      [events, visibleCount, clusteringEnabled],
    );
    // Keep latest overflowMap accessible from the event click handler without
    // re-binding the FullCalendar prop on every render.
    const overflowMapRef = useRef(overflowMap);
    useEffect(() => {
      overflowMapRef.current = overflowMap;
    }, [overflowMap]);

    const coloredEvents = rendered.map((event) => {
      if (event.extendedProps?.isOverflow) {
        return {
          ...event,
          backgroundColor: isDark ? OVERFLOW_BG_DARK : OVERFLOW_BG_LIGHT,
          borderColor: OVERFLOW_ACCENT,
          textColor: 'inherit',
          extendedProps: {
            ...event.extendedProps,
            accentColor: OVERFLOW_ACCENT,
          },
        };
      }
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

    function handleEventClick(info: EventClickArg) {
      if (info.event.extendedProps?.isOverflow) {
        const overflowId = info.event.extendedProps.overflowId as string | undefined;
        if (overflowId && onOverflowClick) {
          const hidden = overflowMapRef.current.get(overflowId) ?? [];
          onOverflowClick(hidden);
        }
        return;
      }
      onEventClick?.(info);
    }

    // Start the time grid one hour above the current time so "now" sits near the
    // top of the viewport — trainers care about upcoming slots, not past ones.
    const scrollTime = useMemo(() => {
      if (!scrollToCurrentTime) return undefined;
      const hour = Math.max(5, new Date().getHours() - 1);
      return `${String(hour).padStart(2, '0')}:00:00`;
    }, [scrollToCurrentTime]);

    // Replace the column header with a compact session summary. View-aware:
    // day view gets a single sentence; week view gets a 2-line stack of
    // "Day Date" + count; month view falls through to the FC default text.
    const dayHeaderContent = showDaySummary
      ? (arg: DayHeaderContentArg) => {
          if (arg.view.type === 'dayGridMonth') return { html: arg.text };

          const dayStart = new Date(arg.date);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setDate(dayEnd.getDate() + 1);

          const dayEvents = events.filter((ev) => {
            if (ev.extendedProps?.isOverflow) return false;
            const start = toDate(ev.start);
            return start && start >= dayStart && start < dayEnd;
          });

          const totalMin = dayEvents.reduce((sum, ev) => {
            const start = toDate(ev.start);
            const end = toDate(ev.end) ?? (start ? new Date(start.getTime() + 30 * 60_000) : null);
            if (!start || !end) return sum;
            return sum + (end.getTime() - start.getTime()) / 60_000;
          }, 0);
          const hours = totalMin / 60;
          const hoursLabel = Number.isInteger(hours) ? hours.toString() : hours.toFixed(1);

          if (arg.view.type === 'timeGridDay') {
            // Single-day view: spacious sentence-style summary.
            if (dayEvents.length === 0) {
              return (
                <span className="text-xs font-normal text-muted-foreground">
                  No sessions — tap a slot to book
                </span>
              );
            }
            return (
              <span className="text-xs font-semibold">
                {dayEvents.length} session{dayEvents.length === 1 ? '' : 's'} · {hoursLabel}h
              </span>
            );
          }

          // Week (or any multi-day) view: tight 2-line stack so 7 columns fit.
          return (
            <div className="flex flex-col items-center gap-0.5 leading-tight">
              <span>{arg.text}</span>
              {dayEvents.length === 0 ? (
                <span className="text-[10px] font-normal normal-case tracking-normal opacity-60">
                  No sessions
                </span>
              ) : (
                <span className="text-[10px] font-semibold normal-case tracking-normal">
                  {dayEvents.length} · {hoursLabel}h
                </span>
              )}
            </div>
          );
        }
      : undefined;

    // Event delegation: when onTitleClick is provided, taps on the FC title open
    // the parent-owned date picker. CSS adds a caret + pointer cursor.
    const handleWrapperClick = onTitleClick
      ? (e: React.MouseEvent) => {
          if ((e.target as HTMLElement).closest('.fc-toolbar-title')) onTitleClick();
        }
      : undefined;

    return (
      <div
        className={`space-y-4${onTitleClick ? ' fc-title-clickable' : ''}`}
        onClick={handleWrapperClick}
      >
        {(showLegend || filterSlot) && (
          <div className="hidden sm:flex items-center justify-between gap-2 rounded-xl bg-muted/40 px-4 py-2.5">
            {/* Legend — hidden on mobile to save vertical space */}
            {showLegend && (
              <div className="hidden sm:flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {STATUS_LABELS.map((s) => (
                  <div key={s.key} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: s.accent }}
                    />
                    <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
                  </div>
                ))}
              </div>
            )}
            {/* Filter slot (expand button etc.) always visible, pushed right */}
            {filterSlot && <div className="ml-auto flex items-center gap-2">{filterSlot}</div>}
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
          eventClick={handleEventClick}
          selectable={selectable}
          select={onDateSelect}
          datesSet={(info) => {
            // FullCalendar fires this on date navigation AND view change.
            if (info.view.type !== currentView) setCurrentView(info.view.type);
            onDatesSet?.(info);
          }}
          height={height}
          slotMinTime="05:00:00"
          slotMaxTime="22:00:00"
          scrollTime={scrollTime}
          dayHeaderContent={dayHeaderContent}
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
            if (info.event.extendedProps?.isOverflow) {
              info.el.classList.add('fc-event-overflow');
              info.el.setAttribute(
                'title',
                `View all ${info.event.extendedProps.overflowCount} sessions in this slot`,
              );
            }
          }}
        />
      </div>
    );
  },
);
