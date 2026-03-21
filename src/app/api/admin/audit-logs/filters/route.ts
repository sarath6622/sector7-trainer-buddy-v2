import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as auditlogService from '@/services/auditlog.service';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const [actions, subjectTypes] = await Promise.all([
      auditlogService.getDistinctActions(session.user.branchId),
      auditlogService.getDistinctSubjectTypes(session.user.branchId),
    ]);

    return NextResponse.json({ data: { actions, subjectTypes } });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
