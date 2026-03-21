import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { listAuditLogsSchema } from '@/lib/validators';
import * as auditlogService from '@/services/auditlog.service';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const params = Object.fromEntries(request.nextUrl.searchParams);
    const parsed = listAuditLogsSchema.parse({
      ...params,
      page: params.page ? Number(params.page) : 1,
      pageSize: params.pageSize ? Number(params.pageSize) : 20,
    });

    const result = await auditlogService.listAuditLogs({
      branchId: session.user.branchId,
      ...parsed,
    });

    return NextResponse.json(result);
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
