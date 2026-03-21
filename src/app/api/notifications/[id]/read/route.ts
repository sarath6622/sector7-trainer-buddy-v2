import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { markAsRead } from '@/lib/notifications';

/**
 * PUT /api/notifications/[id]/read — Mark a single notification as read
 */
export async function PUT(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { id: notificationId } = await params;

    const result = await markAsRead({
      notificationId,
      recipientId: session.user.id,
      branchId: session.user.branchId,
    });

    if (!result) {
      return NextResponse.json(
        { error: 'Notification not found', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[PUT /api/notifications/[id]/read] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
