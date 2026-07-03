import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getNotifications, getUnreadCount } from '@/lib/notifications';

/**
 * GET /api/notifications — Get notifications for the current user
 * Query params: unreadOnly (boolean), page, pageSize
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const url = new URL(req.url);
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10)),
    );

    // When `unreadOnly` is set (the notification-bell poll — by far the most
    // frequent caller), `result.pagination.total` already IS the unread count,
    // so a separate getUnreadCount() would run the identical COUNT query a
    // second time. Reuse it and save a DB round-trip on every poll. Only the
    // full-history view (unreadOnly=false) needs the extra unread count.
    const result = await getNotifications({
      recipientId: session.user.id,
      branchId: session.user.branchId,
      unreadOnly,
      page,
      pageSize,
    });

    const unreadCount = unreadOnly
      ? result.pagination.total
      : await getUnreadCount({
          recipientId: session.user.id,
          branchId: session.user.branchId,
        });

    return NextResponse.json({
      data: result.data,
      pagination: result.pagination,
      unreadCount,
    });
  } catch (error) {
    console.error('[GET /api/notifications] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
