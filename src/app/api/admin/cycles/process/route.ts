import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as carryforward from '@/services/carryforward.service';

/**
 * Manual admin trigger for cycle-end processing.
 * Scopes processing to the caller's branch only. Uses the same idempotent
 * service as the daily cron — running it manually mid-day is safe.
 */
export async function POST() {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const result = await carryforward.processCycleEndsForPackages(
      session.user.branchId,
      session.user.id,
    );
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[POST /api/admin/cycles/process] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
