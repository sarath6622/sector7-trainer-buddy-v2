'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarRange, ChevronRight } from 'lucide-react';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';

interface DateRangePickerModalProps {
  /** YYYY-MM-DD inclusive */
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
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

function fmtShort(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
}

function parseLocalYMD(value: string): Date {
  return new Date(value + 'T00:00:00');
}

export function DateRangePickerModal({
  from,
  to,
  onChange,
  minDate,
  maxDate,
  className,
}: DateRangePickerModalProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayPickerRange | undefined>(() => ({
    from: parseLocalYMD(from),
    to: parseLocalYMD(to),
  }));
  // Anchor coordinates captured at open time — populated from the trigger's
  // bounding rect so the portaled panel positions itself correctly.
  const [anchor, setAnchor] = useState<{ top: number; left: number; width: number } | null>(null);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Track viewport width so the panel can switch from popover (desktop) to a
  // centered modal (mobile). The setState here only fires from the listener,
  // never directly inside the effect, so it passes the no-set-state-in-effect rule.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  function togglePicker() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 8, left: rect.left, width: rect.width });
    setDraft({ from: parseLocalYMD(from), to: parseLocalYMD(to) });
    setOpen(true);
  }

  // Close on outside click — checks both the floating panel and the trigger
  // because the panel lives in document.body (portal), not inside the trigger.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape — same modal-like behavior the rest of the app uses.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Close on scroll/resize so the panel doesn't drift away from the trigger.
  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open]);

  const selected = parseLocalYMD(from);
  const selectedTo = parseLocalYMD(to);
  const isSingleDay = from === to;
  const label = isSingleDay
    ? fmtShort(selected)
    : `${fmtShort(selected)} – ${fmtShort(selectedTo)}`;

  const disabled = (() => {
    const min = minDate ? parseLocalYMD(minDate) : undefined;
    const max = maxDate ? parseLocalYMD(maxDate) : undefined;
    if (!min && !max) return undefined;
    return (date: Date) => {
      if (min && date < min) return true;
      if (max && date > max) return true;
      return false;
    };
  })();

  function handleApply() {
    if (!draft?.from) return;
    // Click-one-day-then-apply is a valid single-day range — fall back to `from`
    // when the user never picked an end date.
    const end = draft.to ?? draft.from;
    onChange({ from: toISODateStr(draft.from), to: toISODateStr(end) });
    setOpen(false);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={togglePicker}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm transition-colors',
          'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring',
          open && 'ring-2 ring-ring',
          className,
        )}
      >
        <CalendarRange className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-left whitespace-nowrap">{label}</span>
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            {/* Mobile backdrop — also acts as a tap-to-close target. Hidden on
                desktop so the popover doesn't dim the page behind it. */}
            {isMobile && <div className="fixed inset-0 z-[99] bg-black/40" aria-hidden />}
            <div
              ref={panelRef}
              className="fixed z-[100] overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-border/60"
              style={
                isMobile
                  ? {
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 'min(92vw, 360px)',
                    }
                  : {
                      top: anchor?.top ?? 0,
                      left: anchor?.left ?? 0,
                      minWidth: anchor?.width ?? 240,
                      maxWidth: '92vw',
                    }
              }
            >
              <div className="px-4 pt-3 pb-1 border-b border-border/40">
                <p className="text-xs font-medium text-muted-foreground">Select date range</p>
                {draft?.from && (
                  <p className="text-xs text-foreground mt-0.5">
                    {fmtShort(draft.from)}
                    {draft.to && draft.to.getTime() !== draft.from.getTime() && (
                      <>
                        <ChevronRight className="inline h-3 w-3 mx-0.5 text-muted-foreground" />
                        {fmtShort(draft.to)}
                      </>
                    )}
                  </p>
                )}
              </div>
              <Calendar
                mode="range"
                selected={draft}
                onSelect={setDraft}
                disabled={disabled}
                numberOfMonths={1}
                initialFocus
              />
              <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={!draft?.from}
                  className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40 transition-opacity"
                >
                  Apply
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
