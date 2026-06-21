'use client';

import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { WorkoutCalendarCard } from './WorkoutCalendarCard';

export interface CalendarClient {
  /** ClientProfile id (used to scope the trainer endpoints). */
  id: string;
  firstName: string;
  lastName: string;
}

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

/**
 * Trainer-facing wrapper around {@link WorkoutCalendarCard}: a horizontal strip
 * of client tabs above the same month calendar the client sees on their own
 * dashboard, scoped to whichever client is selected.
 */
export function ClientWorkoutCalendar({ clients }: { clients: CalendarClient[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(clients[0]?.id ?? null);

  if (clients.length === 0) return null;

  const selected = clients.find((c) => c.id === selectedId) ?? clients[0]!;

  return (
    <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/50">
      {/* Title */}
      <div className="flex items-center gap-2 px-4 pt-4">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">Client Calendar</h2>
        <span className="text-xs text-muted-foreground">· workout history</span>
      </div>

      {/* Client picker — sits inside the same card as the calendar so the two
          read as one component, not a detached row of pills. */}
      <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {clients.map((c) => {
          const active = c.id === selected.id;
          return (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors ${
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/60 text-muted-foreground hover:bg-muted/40'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold ${
                  active ? 'bg-primary/20 text-primary' : 'bg-muted text-foreground'
                }`}
              >
                {initials(c.firstName, c.lastName)}
              </span>
              {c.firstName} {c.lastName}
            </button>
          );
        })}
      </div>

      {/* Divider ties the picker to the calendar below it. */}
      <div className="border-t border-border/50" />

      {/* Calendar for the selected client, embedded (no chrome of its own).
          The key remounts it per client so it resets to the current month
          and re-fetches cleanly. */}
      <WorkoutCalendarCard
        embedded
        key={selected.id}
        calendarEndpoint={`/api/trainer/clients/${selected.id}/workout-calendar`}
        workoutsEndpoint={`/api/trainer/clients/${selected.id}/workouts`}
        sessionHref={(sessionId) => `/trainer/sessions/${sessionId}`}
      />
    </div>
  );
}
