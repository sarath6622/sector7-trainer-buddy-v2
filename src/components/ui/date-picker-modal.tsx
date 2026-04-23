'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar, CalendarDayButton } from '@/components/ui/calendar';

interface DatePickerModalProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  /** Disable individual dates */
  disabled?: (date: Date) => boolean;
  /** Convenience shorthand — disables all dates before this YYYY-MM-DD */
  minDate?: string;
  /** Convenience shorthand — disables all dates after this YYYY-MM-DD */
  maxDate?: string;
  className?: string;
}

function toISODateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DatePickerModal({
  value,
  onChange,
  placeholder = 'Pick a date',
  disabled,
  minDate,
  maxDate,
  className,
}: DatePickerModalProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = value ? new Date(value + 'T00:00:00') : undefined;

  const displayLabel = selected
    ? selected.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : placeholder;

  const isDisabled = (date: Date): boolean => {
    if (disabled?.(date)) return true;
    if (minDate) {
      const min = new Date(minDate + 'T00:00:00');
      if (date < min) return true;
    }
    if (maxDate) {
      const max = new Date(maxDate + 'T00:00:00');
      if (date > max) return true;
    }
    return false;
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm transition-colors',
          'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring',
          !value && 'text-muted-foreground',
          open && 'ring-2 ring-ring',
          className,
        )}
      >
        <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-left">{displayLabel}</span>
      </button>

      {/* Inline dropdown — no backdrop */}
      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 overflow-hidden rounded-2xl bg-card shadow-xl ring-1 ring-border/60">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              if (date) {
                onChange(toISODateStr(date));
                setOpen(false);
              }
            }}
            disabled={isDisabled}
            initialFocus
            components={{ DayButton: CalendarDayButton }}
            className="p-2 [--cell-size:1.5rem] text-xs"
          />
        </div>
      )}
    </div>
  );
}
