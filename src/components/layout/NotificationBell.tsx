'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Bell, BellOff, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuBackdrop,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFcmToken } from '@/hooks/useFcmToken';
import {
  NotificationCard,
  type AppNotification,
} from '@/components/notifications/NotificationItem';

const POLL_INTERVAL = 10_000; // 10 seconds

export function NotificationBell() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role ?? '';
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // -1 = not yet initialised (skip toast on first load)
  const prevUnreadRef = useRef(-1);

  useFcmToken();

  const fetchNotifications = useCallback(async () => {
    try {
      // The dropdown is an inbox: unread only. Read history lives on /notifications.
      const res = await fetch('/api/notifications?unreadOnly=true&pageSize=10');
      if (res.ok) {
        const json = await res.json();
        const newCount: number = json.unreadCount;

        // Show toast when new notifications arrive (skip very first fetch)
        if (prevUnreadRef.current >= 0 && newCount > prevUnreadRef.current) {
          const newest: AppNotification = json.data[0];
          if (newest && !newest.readAt) {
            toast.message(newest.title, { description: newest.body });
          }
        }
        prevUnreadRef.current = newCount;

        setNotifications(json.data);
        setUnreadCount(newCount);
      }
    } catch {
      // Silently fail — notifications are non-critical
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchNotifications();
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchNotifications]);

  // Refresh when dropdown opens
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  async function markRead(id: string) {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'PUT' });
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch {
      // Silently fail
    }
  }

  async function markAllRead() {
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'PUT' });
      if (res.ok) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch {
      // Silently fail
    }
  }

  function navigateTo(href: string, notification?: AppNotification) {
    if (notification && !notification.readAt) markRead(notification.id);
    setOpen(false);
    router.push(href);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'relative')}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -right-1 -top-1 h-4 min-w-4 rounded-full p-0 text-[10px] flex items-center justify-center"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
        <span className="sr-only">Notifications</span>
      </DropdownMenuTrigger>
      {/* Blur the page behind the panel — mobile only, and never the top nav
          (header is h-12 on mobile, plus the iOS safe-area inset above it) */}
      <DropdownMenuBackdrop className="top-[calc(3rem+env(safe-area-inset-top))] lg:hidden" />
      <DropdownMenuContent
        align="end"
        collisionPadding={8}
        collisionAvoidance={{ align: 'shift' }}
        className="w-[min(var(--available-width),380px)] rounded-2xl bg-popover/90 p-0 shadow-xl backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
          <p className="text-base font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-xs font-semibold text-primary transition-opacity hover:opacity-80"
              onClick={markAllRead}
            >
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-[26rem] overflow-y-auto px-2 pb-1">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <BellOff className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">You&apos;re all caught up</p>
            </div>
          ) : (
            <div className="space-y-1.5 py-1">
              {notifications.map((n) => (
                <NotificationCard
                  key={n.id}
                  notification={n}
                  role={role}
                  onNavigate={(href) => navigateTo(href, n)}
                  onDismiss={() => markRead(n.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-b-2xl border-t border-border/50 px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-accent/40"
          onClick={() => navigateTo('/notifications')}
        >
          View all notifications
          <ChevronRight className="h-4 w-4" />
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
