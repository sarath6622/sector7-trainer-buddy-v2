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

    const [result, unreadCount] = await Promise.all([
      getNotifications({
        recipientId: session.user.id,
        branchId: session.user.branchId,
        unreadOnly,
        page,
        pageSize,
      }),
      getUnreadCount({
        recipientId: session.user.id,
        branchId: session.user.branchId,
      }),
    ]);

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
