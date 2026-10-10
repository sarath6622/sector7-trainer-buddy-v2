'use client';

import { Users } from 'lucide-react';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';

export type ClientComboboxOption = SearchSelectOption;

/**
 * Searchable client picker.
 *
 * Thin wrapper over {@link SearchSelect} — it only supplies client-flavoured
 * defaults (the people icon and the copy). Kept as its own component because
 * picking a client is the single most common case in the app and callers read
 * better for it; reach for `SearchSelect` directly for anything else.
 */
export function ClientCombobox({
  options,
  value,
  onChange,
  placeholder = 'Select client',
  searchPlaceholder = 'Search clients...',
  emptyLabel = 'No clients',
  showInitials = false,
  scrollIntoViewOnOpen = false,
  className,
}: {
  options: ClientComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** Render an initials avatar on the trigger and in the list. */
  showInitials?: boolean;
  /** Scroll the picker to the top of its scrollport when it opens. */
  scrollIntoViewOnOpen?: boolean;
  className?: string;
}) {
  return (
    <SearchSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyLabel={emptyLabel}
      icon={Users}
      showInitials={showInitials}
      scrollIntoViewOnOpen={scrollIntoViewOnOpen}
      className={className}
    />
  );
}
