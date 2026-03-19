import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getSessionCounts } from '@/services/session.service';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['CLIENT'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const clientProfileId = session.user.clientProfileId;
    if (!clientProfileId) {
      return NextResponse.json({ error: 'No client profile', code: 'NO_PROFILE' }, { status: 400 });
    }

    const branchId = session.user.branchId;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Session counts for current month
    const sessionCount = await getSessionCounts({
      clientProfileId,
      branchId,
      month: currentMonth,
    });

    // Next upcoming session
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextSession = await prisma.sessionInstance.findFirst({
      where: {
        branchId,
        clientProfileId,
        status: 'SCHEDULED',
        scheduledDate: { gte: today },
      },
      include: {
        trainer: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
    });

    // Active session (IN_PROGRESS)
    const activeSession = await prisma.sessionInstance.findFirst({
      where: {
        branchId,
        clientProfileId,
        status: 'IN_PROGRESS',
      },
      include: {
        trainer: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    // Trainer info from active PT package
    const activePkg = await prisma.ptPackage.findFirst({
      where: { branchId, clientProfileId, isActive: true },
      include: {
        trainer: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    return NextResponse.json({
      data: {
        sessionCount,
        nextSession,
        activeSession,
        trainer: activePkg
          ? {
              name: `${activePkg.trainer.user.firstName} ${activePkg.trainer.user.lastName}`,
              sessionsPerMonth: activePkg.sessionsPerMonth,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('[GET /api/client/dashboard] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
