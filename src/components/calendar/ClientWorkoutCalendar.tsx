'use client';

import { useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { WorkoutCalendarCard } from './WorkoutCalendarCard';
import { ClientCombobox } from '@/components/forms/ClientCombobox';

export interface CalendarClient {
  /** ClientProfile id (used to scope the trainer endpoints). */
  id: string;
  firstName: string;
  lastName: string;
}

/**
 * Trainer-facing wrapper around {@link WorkoutCalendarCard}: a searchable
 * client picker above the same month calendar the client sees on their own
 * dashboard, scoped to whichever client is selected.
 */
export function ClientWorkoutCalendar({ clients }: { clients: CalendarClient[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(clients[0]?.id ?? null);

  const options = useMemo(
    () => clients.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName}` })),
    [clients]
  );

  if (clients.length === 0) return null;

  const selected = clients.find((c) => c.id === selectedId) ?? clients[0];
  if (!selected) return null;

  return (
    <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border/50">
      {/* Title */}
      <div className="flex items-center gap-2 px-4 pt-4">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">Client Calendar</h2>
        <span className="text-xs text-muted-foreground">· workout history</span>
      </div>

      {/* Client picker — a dropdown rather than a pill strip: trainers can
          carry 50+ clients, which no horizontal row of pills can scan. Sits
          inside the same card as the calendar so the two read as one. */}
      <div className="mt-3 px-4 pb-4">
        <ClientCombobox
          options={options}
          value={selected.id}
          onChange={setSelectedId}
          showInitials
          scrollIntoViewOnOpen
          // scroll-mt clears the card's own title row, so opening the picker
          // parks the whole card at the top of the scrollport rather than
          // beheading it.
          className="w-full scroll-mt-14 sm:max-w-xs"
        />
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
