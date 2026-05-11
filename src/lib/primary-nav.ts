import {
  LayoutDashboard,
  Users,
  Calendar,
  CalendarDays,
  ClipboardList,
  Flame,
  TrendingUp,
  UserCheck,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import type { NavItem } from '@/lib/constants';

export interface PrimaryNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const TRAINER_PRIMARY: PrimaryNavItem[] = [
  { label: 'Dashboard', href: '/trainer', icon: LayoutDashboard },
  { label: 'Clients', href: '/trainer/clients', icon: Users },
  { label: 'Schedule', href: '/trainer/schedule', icon: Calendar },
  { label: 'Leaves', href: '/trainer/leaves', icon: CalendarDays },
];

const CLIENT_PRIMARY: PrimaryNavItem[] = [
  { label: 'Dashboard', href: '/client', icon: LayoutDashboard },
  { label: 'Sessions', href: '/client/sessions', icon: ClipboardList },
  { label: 'Community', href: '/community', icon: Flame },
  { label: 'Progress', href: '/client/progress', icon: TrendingUp },
];

const ADMIN_PRIMARY: PrimaryNavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Scheduling', href: '/admin/scheduling', icon: Calendar },
  { label: 'Clients', href: '/admin/clients', icon: Users },
  { label: 'Trainers', href: '/admin/trainers', icon: UserCheck },
  { label: 'Audit Log', href: '/admin/audit-log', icon: FileText },
];

export const PRIMARY_NAV_BY_ROLE: Record<string, PrimaryNavItem[]> = {
  SUPER_ADMIN: ADMIN_PRIMARY,
  BRANCH_ADMIN: ADMIN_PRIMARY,
  TRAINER: TRAINER_PRIMARY,
  KICKBOXING_TRAINER: TRAINER_PRIMARY,
  CROSSFIT_TRAINER: TRAINER_PRIMARY,
  CLIENT: CLIENT_PRIMARY,
};

export function getPrimaryNav(role: string): PrimaryNavItem[] {
  return PRIMARY_NAV_BY_ROLE[role] ?? [];
}

export function getOverflowNav(role: string, navItems: NavItem[]): NavItem[] {
  const primaryHrefs = new Set(getPrimaryNav(role).map((i) => i.href));
  return navItems.filter((item) => !primaryHrefs.has(item.href));
}
