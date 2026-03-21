import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { markAllAsRead } from '@/lib/notifications';

/**
 * PUT /api/notifications/read-all — Mark all notifications as read
 */
export async function PUT() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const result = await markAllAsRead({
      recipientId: session.user.id,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: { count: result.count } });
  } catch (error) {
    console.error('[PUT /api/notifications/read-all] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
