import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse, AppError } from '@/lib/errors';
import { tvOptInSchema } from '@/lib/validators';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles ?? [session.user.role], ['CLIENT'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }
    if (!session.user.clientProfileId) {
      throw new AppError('NOT_FOUND', 'Client profile not found for session', 404);
    }
    const row = await prisma.clientProfile.findUnique({
      where: { id: session.user.clientProfileId },
      select: { showOnTv: true },
    });
    if (!row) {
      throw new AppError('NOT_FOUND', 'Client profile not found', 404);
    }
    return NextResponse.json({ data: { showOnTv: row.showOnTv } });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles ?? [session.user.role], ['CLIENT'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }
    if (!session.user.clientProfileId) {
      throw new AppError('NOT_FOUND', 'Client profile not found for session', 404);
    }

    const body = await request.json();
    const { showOnTv } = tvOptInSchema.parse(body);

    const before = await prisma.clientProfile.findUnique({
      where: { id: session.user.clientProfileId },
      select: { showOnTv: true, branchId: true },
    });
    if (!before) {
      throw new AppError('NOT_FOUND', 'Client profile not found', 404);
    }

    if (before.showOnTv !== showOnTv) {
      await prisma.clientProfile.update({
        where: { id: session.user.clientProfileId },
        data: { showOnTv },
      });

      await auditLog({
        action: 'CLIENT_TV_OPT_IN_TOGGLED',
        actorId: session.user.id,
        subjectType: 'ClientProfile',
        subjectId: session.user.clientProfileId,
        branchId: before.branchId,
        oldValue: { showOnTv: before.showOnTv },
        newValue: { showOnTv },
      });
    }

    return NextResponse.json({ data: { showOnTv } });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
