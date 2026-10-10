import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getPackageAudit } from '@/services/package-audit.service';

/**
 * Branch-wide reconciliation of paid-for vs used sessions, one row per client.
 *
 * Read-only: it computes nothing it stores and mutates nothing, so there is no
 * audit-log write here (Rule 6 covers mutations).
 *
 * Filtering and sorting are done client-side — the whole branch is ~230 rows,
 * which is small enough to ship in one response and keeps the page responsive
 * while an admin scans it with a trainer sitting next to them.
 */
export async function GET() {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { data, summary } = await getPackageAudit(session.user.branchId);

    return NextResponse.json({ data, summary });
  } catch (error) {
    console.error('[GET /api/admin/package-audit] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
