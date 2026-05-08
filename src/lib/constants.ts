import {
  LayoutDashboard,
  Users,
  Calendar,
  ClipboardList,
  Dumbbell,
  TrendingUp,
  Settings,
  FileText,
  UserCheck,
  CalendarDays,
  Activity,
  BarChart3,
  Trophy,
  Flame,
  CalendarClock,
  Clock,
  Package,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  group?: string; // Used to render section labels in the sidebar
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  // People
  { label: 'Clients', href: '/admin/clients', icon: Users, group: 'People' },
  { label: 'Trainers', href: '/admin/trainers', icon: UserCheck, group: 'People' },
  // Operations
  { label: 'Shifts', href: '/admin/shifts', icon: Clock, group: 'Operations' },
  { label: 'Scheduling', href: '/admin/scheduling', icon: Calendar, group: 'Operations' },
  { label: 'Sessions', href: '/admin/sessions', icon: ClipboardList, group: 'Operations' },
  { label: 'Leaves', href: '/admin/leaves', icon: CalendarDays, group: 'Operations' },
  {
    label: 'Reschedules',
    href: '/admin/reschedule-requests',
    icon: CalendarClock,
    group: 'Operations',
  },
  // Programs
  { label: 'Exercises', href: '/admin/exercises', icon: Dumbbell, group: 'Programs' },
  { label: 'Badges', href: '/admin/badges', icon: Trophy, group: 'Programs' },
  { label: 'Kickboxing', href: '/admin/kickboxing', icon: Activity, group: 'Programs' },
  { label: 'CrossFit', href: '/admin/crossfit', icon: Dumbbell, group: 'Programs' },
  // Insights
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3, group: 'Insights' },
  { label: 'Audit Log', href: '/admin/audit-log', icon: FileText, group: 'Insights' },
  // System
  {
    label: 'Package Plans',
    href: '/admin/settings/package-plans',
    icon: Package,
    group: 'System',
  },
  { label: 'Settings', href: '/admin/settings', icon: Settings, group: 'System' },
];

export const TRAINER_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/trainer', icon: LayoutDashboard },
  // My Work
  { label: 'My Clients', href: '/trainer/clients', icon: Users, group: 'My Work' },
  { label: 'Schedule', href: '/trainer/schedule', icon: Calendar, group: 'My Work' },
  {
    label: 'Reschedules',
    href: '/trainer/reschedule-requests',
    icon: CalendarClock,
    group: 'My Work',
  },
  { label: 'Leaves', href: '/trainer/leaves', icon: CalendarDays, group: 'My Work' },
  // Insights
  { label: 'Analytics', href: '/trainer/analytics', icon: BarChart3, group: 'Insights' },
  // Community
  { label: 'Community', href: '/community', icon: Flame, group: 'Community' },
];

export const CLIENT_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/client', icon: LayoutDashboard },
  // Training
  { label: 'Sessions', href: '/client/sessions', icon: ClipboardList, group: 'Training' },
  { label: 'Workouts', href: '/client/workouts', icon: Dumbbell, group: 'Training' },
  { label: 'Progress', href: '/client/progress', icon: TrendingUp, group: 'Training' },
  // Rewards
  { label: 'Badges', href: '/client/badges', icon: Trophy, group: 'Rewards' },
  // Schedule
  {
    label: 'Unavailability',
    href: '/client/unavailability',
    icon: CalendarDays,
    group: 'Schedule',
  },
  {
    label: 'Reschedules',
    href: '/client/reschedule-requests',
    icon: CalendarClock,
    group: 'Schedule',
  },
  // Community
  { label: 'Community', href: '/community', icon: Flame, group: 'Community' },
];

export const CROSSFIT_TRAINER_NAV_ITEMS: NavItem[] = [
  { label: 'Attendance', href: '/trainer/crossfit', icon: Dumbbell },
];

export const KICKBOXING_TRAINER_NAV_ITEMS: NavItem[] = [
  { label: 'Attendance', href: '/trainer/kickboxing', icon: Activity },
];

export const NAV_BY_ROLE: Record<string, NavItem[]> = {
  SUPER_ADMIN: ADMIN_NAV_ITEMS,
  BRANCH_ADMIN: ADMIN_NAV_ITEMS,
  TRAINER: TRAINER_NAV_ITEMS,
  KICKBOXING_TRAINER: KICKBOXING_TRAINER_NAV_ITEMS,
  CROSSFIT_TRAINER: CROSSFIT_TRAINER_NAV_ITEMS,
  CLIENT: CLIENT_NAV_ITEMS,
};
