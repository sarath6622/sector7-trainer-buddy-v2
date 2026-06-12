'use client';

import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  ChevronRight,
  CreditCard,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  notificationAction,
  notificationKind,
  type NotificationKind,
} from '@/lib/notification-routing';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

const KIND_STYLES: Record<NotificationKind, { icon: LucideIcon; tile: string }> = {
  session: { icon: CalendarDays, tile: 'bg-blue-500/15 text-blue-500 dark:text-blue-400' },
  leave: { icon: CalendarOff, tile: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  reschedule: {
    icon: CalendarClock,
    tile: 'bg-violet-500/15 text-violet-500 dark:text-violet-400',
  },
  reassignment: { icon: Users, tile: 'bg-indigo-500/15 text-indigo-500 dark:text-indigo-400' },
  payment: { icon: CreditCard, tile: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  alert: { icon: AlertTriangle, tile: 'bg-red-500/15 text-red-500 dark:text-red-400' },
  generic: { icon: Bell, tile: 'bg-primary/15 text-primary' },
};

export function formatNotificationTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

/** Unread notification — highlighted card with action buttons. */
export function NotificationCard({
  notification,
  role,
  onNavigate,
  onDismiss,
}: {
  notification: AppNotification;
  role: string;
  onNavigate: (href: string) => void;
  onDismiss: () => void;
}) {
  const { href, label } = notificationAction(notification, role);
  const { icon: Icon, tile } = KIND_STYLES[notificationKind(notification)];

  return (
    <div className="relative rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/15 to-primary/5 p-3">
      <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-primary" aria-hidden />
      <div className="flex gap-3">
        <div
          className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tile)}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 pr-4">
          <p className="text-sm font-semibold leading-snug">{notification.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
            {notification.body}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground/70">
            {formatNotificationTime(notification.createdAt)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          className="h-8 flex-1 rounded-lg text-xs font-semibold"
          onClick={() => onNavigate(href)}
        >
          {label}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 flex-1 rounded-lg bg-transparent text-xs"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

/** Read notification — compact row, clicking navigates to the relevant page. */
export function NotificationRow({
  notification,
  role,
  onNavigate,
}: {
  notification: AppNotification;
  role: string;
  onNavigate: (href: string) => void;
}) {
  const { href } = notificationAction(notification, role);
  const { icon: Icon, tile } = KIND_STYLES[notificationKind(notification)];

  return (
    <button
      type="button"
      className="group flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-accent/50"
      onClick={() => onNavigate(href)}
    >
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tile)}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{notification.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">
          {notification.body}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/70">
          {formatNotificationTime(notification.createdAt)}
        </p>
      </div>
      <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
    </button>
  );
}
