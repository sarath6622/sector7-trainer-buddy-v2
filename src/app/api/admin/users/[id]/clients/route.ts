import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { toErrorResponse } from '@/lib/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const branchId = session.user.branchId;

    const user = await prisma.user.findFirst({
      where: { id, branchId },
      select: { trainerProfile: { select: { id: true } } },
    });

    if (!user?.trainerProfile) {
      return NextResponse.json({ data: [] });
    }

    const trainerProfileId = user.trainerProfile.id;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const packages = await prisma.ptPackage.findMany({
      where: { branchId, trainerProfileId, isActive: true },
      include: {
        plan: { select: { id: true, name: true } },
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

    const items = await Promise.all(
      packages.map(async (pkg) => {
        const windowStart = pkg.startDate;
        const windowEnd = pkg.endDate ?? new Date(windowStart.getTime() + 30 * 24 * 60 * 60 * 1000);

        const windowSessions = await prisma.sessionInstance.findMany({
          where: {
            branchId,
            clientProfileId: pkg.clientProfileId,
            scheduledDate: { gte: windowStart, lte: windowEnd },
          },
          select: { status: true },
        });

        const completed = windowSessions.filter((s) => s.status === 'COMPLETED').length;
        const noShow = windowSessions.filter((s) => s.status === 'NO_SHOW').length;
        const used = completed + noShow + pkg.onboardingUsedSessions;

        const nextSession = await prisma.sessionInstance.findFirst({
          where: {
            branchId,
            clientProfileId: pkg.clientProfileId,
            trainerProfileId,
            status: 'SCHEDULED',
            scheduledDate: { gte: today },
          },
          orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
          select: { id: true, scheduledDate: true, scheduledTime: true },
        });

        return {
          clientProfile: {
            id: pkg.client.id,
            paymentStatus: pkg.client.paymentStatus,
            user: pkg.client.user,
          },
          package: {
            id: pkg.id,
            planName: pkg.plan?.name ?? null,
            sessionsPerMonth: pkg.sessionsPerMonth,
            totalSessions: pkg.totalSessions,
            used,
            startDate: pkg.startDate.toISOString(),
            endDate: pkg.endDate?.toISOString() ?? null,
          },
          nextSession: nextSession
            ? {
                id: nextSession.id,
                scheduledDate: nextSession.scheduledDate.toISOString(),
                scheduledTime: nextSession.scheduledTime,
              }
            : null,
        };
      }),
    );

    items.sort((a, b) => {
      const an = `${a.clientProfile.user.firstName} ${a.clientProfile.user.lastName}`;
      const bn = `${b.clientProfile.user.firstName} ${b.clientProfile.user.lastName}`;
      return an.localeCompare(bn);
    });

    return NextResponse.json({ data: items });
  } catch (error) {
    console.error('[GET /api/admin/users/[id]/clients] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
