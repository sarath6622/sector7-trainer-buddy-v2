'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { BellOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  NotificationCard,
  NotificationRow,
  type AppNotification,
} from '@/components/notifications/NotificationItem';

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const role = session?.user?.role ?? '';

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = useCallback(async (pageToLoad: number) => {
    try {
      const res = await fetch(`/api/notifications?page=${pageToLoad}&pageSize=${PAGE_SIZE}`);
      if (!res.ok) return;
      const json = await res.json();
      setNotifications((prev) =>
        pageToLoad === 1 ? json.data : [...prev, ...(json.data as AppNotification[])],
      );
      setUnreadCount(json.unreadCount);
      setTotalPages(json.pagination?.totalPages ?? 1);
      setPage(pageToLoad);
    } catch {
      // Silently fail — notifications are non-critical
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(1);
  }, [fetchPage]);

  async function markRead(id: string) {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'PUT' });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
        );
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
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
        );
        setUnreadCount(0);
      }
    } catch {
      // Silently fail
    }
  }

  function navigateTo(href: string, notification?: AppNotification) {
    if (notification && !notification.readAt) markRead(notification.id);
    router.push(href);
  }

  const unread = notifications.filter((n) => !n.readAt);
  const read = notifications.filter((n) => n.readAt);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            className="text-sm font-semibold text-primary transition-opacity hover:opacity-80"
            onClick={markAllRead}
          >
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-card py-16 ring-1 ring-border/50">
          <BellOff className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No notifications yet</p>
        </div>
      ) : (
        <>
          {unread.length > 0 && (
            <section className="space-y-2">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                New
              </h2>
              {unread.map((n) => (
                <NotificationCard
                  key={n.id}
                  notification={n}
                  role={role}
                  onNavigate={(href) => navigateTo(href, n)}
                  onDismiss={() => markRead(n.id)}
                />
              ))}
            </section>
          )}

          {read.length > 0 && (
            <section className="space-y-1">
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Earlier
              </h2>
              <div className="rounded-2xl bg-card p-2 ring-1 ring-border/50">
                {read.map((n) => (
                  <NotificationRow
                    key={n.id}
                    notification={n}
                    role={role}
                    onNavigate={(href) => navigateTo(href)}
                  />
                ))}
              </div>
            </section>
          )}

          {page < totalPages && (
            <Button
              variant="outline"
              className="w-full rounded-xl"
              disabled={loadingMore}
              onClick={() => {
                setLoadingMore(true);
                fetchPage(page + 1);
              }}
            >
              {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Load more
            </Button>
          )}
        </>
      )}
    </div>
  );
}
