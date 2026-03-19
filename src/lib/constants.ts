import {
  LayoutDashboard,
  Users,
  Calendar,
  ClipboardList,
  Dumbbell,
  TrendingUp,
  CreditCard,
  Settings,
  FileText,
  UserCheck,
  CalendarDays,
  Activity,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Clients', href: '/admin/clients', icon: Users },
  { label: 'Trainers', href: '/admin/trainers', icon: UserCheck },
  { label: 'Scheduling', href: '/admin/scheduling', icon: Calendar },
  { label: 'Sessions', href: '/admin/sessions', icon: ClipboardList },
  { label: 'Leaves', href: '/admin/leaves', icon: CalendarDays },
  { label: 'Exercises', href: '/admin/exercises', icon: Dumbbell },
  { label: 'Kickboxing', href: '/admin/kickboxing', icon: Activity },
  { label: 'Payments', href: '/admin/payments', icon: CreditCard },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { label: 'Audit Log', href: '/admin/audit-log', icon: FileText },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];

export const TRAINER_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/trainer', icon: LayoutDashboard },
  { label: 'My Clients', href: '/trainer/clients', icon: Users },
  { label: 'Schedule', href: '/trainer/schedule', icon: Calendar },
  { label: 'Leaves', href: '/trainer/leaves', icon: CalendarDays },
  { label: 'Analytics', href: '/trainer/analytics', icon: BarChart3 },
];

export const CLIENT_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/client', icon: LayoutDashboard },
  { label: 'Sessions', href: '/client/sessions', icon: ClipboardList },
  { label: 'Workouts', href: '/client/workouts', icon: Dumbbell },
  { label: 'Progress', href: '/client/progress', icon: TrendingUp },
  { label: 'Unavailability', href: '/client/unavailability', icon: CalendarDays },
];

export const NAV_BY_ROLE: Record<string, NavItem[]> = {
  SUPER_ADMIN: ADMIN_NAV_ITEMS,
  BRANCH_ADMIN: ADMIN_NAV_ITEMS,
  TRAINER: TRAINER_NAV_ITEMS,
  KICKBOXING_TRAINER: TRAINER_NAV_ITEMS,
  CLIENT: CLIENT_NAV_ITEMS,
};
