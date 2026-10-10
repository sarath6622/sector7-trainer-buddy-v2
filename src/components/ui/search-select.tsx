'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, Users, type LucideIcon } from 'lucide-react';
import { useKeyboardViewport } from '@/hooks/useKeyboardInset';
import { cn } from '@/lib/utils';

export interface SearchSelectOption {
  /** Stable id passed back through `onChange`. */
  value: string;
  label: string;
  /** Optional second line, searched alongside the label. */
  hint?: string;
}

function initials(label: string) {
  const parts = label.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

/**
 * Searchable single-select — one trigger button plus a filtered popover list.
 *
 * The app's lists get long (200+ clients, 20+ trainers), which is exactly where
 * a plain `<Select>` stops working: no way to type, and the native listbox
 * scrolls past the fold. This is the shared implementation behind every
 * "pick one of many" control so they all look and behave identically.
 *
 * Generalised from `ClientCombobox`, which now delegates here.
 */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyLabel = 'No matches',
  leadingLabel,
  icon: Icon = Users,
  showInitials = false,
  scrollIntoViewOnOpen = false,
  disabled = false,
  className,
  triggerClassName,
}: {
  options: SearchSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** Muted prefix on the trigger, e.g. "Trainer: ". Not part of the search. */
  leadingLabel?: string;
  /** Icon on the trigger when nothing is selected (or when not using initials). */
  icon?: LucideIcon;
  /** Render an initials avatar on the trigger and in the list. */
  showInitials?: boolean;
  /**
   * Scroll the picker to the top of its scrollport when it opens. Off by
   * default: inside a dialog the list already has the room it needs, and
   * scrolling the dialog body out from under the user would be jarring.
   */
  scrollIntoViewOnOpen?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const { inset: keyboardInset } = useKeyboardViewport();
  const keyboardOpen = keyboardInset > 0;

  const selected = options.find((o) => o.value === value);

  // Every whitespace-separated term must match, so "sum aa" finds
  // "Aaby Lal" under trainer "Sumayya" without caring about order.
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered =
    terms.length === 0
      ? options
      : options.filter((o) => {
          const haystack = `${o.label} ${o.hint ?? ''}`.toLowerCase();
          return terms.every((t) => haystack.includes(t));
        });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Bring the picker to the top of the scrollport when it opens, so the list
  // drops into empty space instead of wherever the row happened to sit. On a
  // phone an unscrolled picker near the fold puts its list straight behind the
  // keyboard. The document never scrolls in the dashboard shell — <main> is the
  // scroll container — so scrollIntoView moves <main>, landing the picker just
  // under the TopNav; how much context stays above it is the caller's
  // `scroll-mt-*`.
  //
  // `keyboardOpen` is a dependency, not just `open`: the search field
  // autofocuses, so iOS raises the keyboard a frame or two later and shrinks
  // the visual viewport under our feet. Re-running once that lands keeps the
  // picker pinned. Keyed on the open/close transitions rather than the px, so
  // it fires once per change and doesn't fight manual scrolling.
  useEffect(() => {
    if (!open || !scrollIntoViewOnOpen) return;
    const el = containerRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() =>
      el.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, scrollIntoViewOnOpen, keyboardOpen]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          setSearch('');
        }}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm transition-colors hover:bg-muted/50',
          disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
          triggerClassName,
        )}
      >
        {showInitials && selected ? (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[9px] font-bold text-primary">
            {initials(selected.label)}
          </span>
        ) : (
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 truncate text-left">
          {leadingLabel && <span className="text-muted-foreground">{leadingLabel}</span>}
          <span className={cn(!selected && 'text-muted-foreground')}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out',
            open && 'rotate-180',
          )}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 w-full origin-top overflow-hidden rounded-lg bg-popover shadow-lg ring-1 ring-foreground/10 duration-150 ease-out animate-in fade-in-0 zoom-in-95 slide-in-from-top-2"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false);
                // Enter with exactly one match is the fast path when someone
                // has typed enough to disambiguate.
                if (e.key === 'Enter' && filtered.length === 1) {
                  onChange(filtered[0]!.value);
                  setOpen(false);
                }
              }}
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-[240px] overflow-y-auto p-1">
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={value === o.value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                  value === o.value ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                )}
              >
                {showInitials && (
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold',
                      value === o.value ? 'bg-primary/20 text-primary' : 'bg-muted text-foreground',
                    )}
                  >
                    {initials(o.label)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && (
                    <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>
                  )}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="px-2.5 py-3 text-center text-xs text-muted-foreground">{emptyLabel}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
