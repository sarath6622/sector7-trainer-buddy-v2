import type { NavItem } from '@/lib/constants';

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export function groupNavItems(items: NavItem[]): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.label === item.group) {
      last.items.push(item);
    } else {
      groups.push({ label: item.group, items: [item] });
    }
  }
  return groups;
}
