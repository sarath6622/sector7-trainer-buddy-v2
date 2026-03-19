import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['TRAINER', 'KICKBOXING_TRAINER'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const trainerProfileId = session.user.trainerProfileId;
    if (!trainerProfileId) {
      return NextResponse.json(
        { error: 'No trainer profile', code: 'NO_PROFILE' },
        { status: 400 },
      );
    }

    const branchId = session.user.branchId;

    // Get all active PT packages for this trainer to find assigned clients
    const packages = await prisma.ptPackage.findMany({
      where: { branchId, trainerProfileId, isActive: true },
      include: {
        client: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                profileImageUrl: true,
              },
            },
          },
        },
      },
    });

    // For each client, get session counts for current month and next session
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const clientsWithStats = await Promise.all(
      packages.map(async (pkg) => {
        // Session counts for this month
        const sessions = await prisma.sessionInstance.findMany({
          where: {
            branchId,
            clientProfileId: pkg.clientProfileId,
            trainerProfileId,
            scheduledDate: { gte: monthStart, lte: monthEnd },
          },
          select: { status: true },
        });

        const completed = sessions.filter((s) => s.status === 'COMPLETED').length;
        const noShow = sessions.filter((s) => s.status === 'NO_SHOW').length;
        const scheduled = sessions.filter((s) => s.status === 'SCHEDULED').length;
        const used = completed + noShow;

        // Next upcoming session
        const nextSession = await prisma.sessionInstance.findFirst({
          where: {
            branchId,
            clientProfileId: pkg.clientProfileId,
            trainerProfileId,
            status: 'SCHEDULED',
            scheduledDate: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
          },
          orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
          select: { id: true, scheduledDate: true, scheduledTime: true },
        });

        return {
          clientProfile: pkg.client,
          package: {
            id: pkg.id,
            sessionsPerMonth: pkg.sessionsPerMonth,
            sessionChargeAmount: pkg.sessionChargeAmount,
          },
          stats: {
            totalThisMonth: sessions.length,
            completed,
            noShow,
            scheduled,
            used,
            remaining: scheduled,
          },
          nextSession,
        };
      }),
    );

    return NextResponse.json({ data: clientsWithStats });
  } catch (error) {
    console.error('[GET /api/trainer/clients] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
