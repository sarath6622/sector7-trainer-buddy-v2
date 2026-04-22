import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/clients/expiring?days=10
 * Returns active PT packages expiring within the given number of days.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') ?? '10', 10);

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() + days);

    const packages = await prisma.ptPackage.findMany({
      where: {
        branchId: session.user.branchId,
        isActive: true,
        endDate: { gte: now, lte: cutoff },
      },
      include: {
        client: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
        trainer: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { endDate: 'asc' },
    });

    const data = packages.map((pkg) => {
      const end = new Date(
        pkg.endDate!.getFullYear(),
        pkg.endDate!.getMonth(),
        pkg.endDate!.getDate(),
      );
      const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);
      return {
        packageId: pkg.id,
        clientName: `${pkg.client.user.firstName} ${pkg.client.user.lastName}`,
        clientEmail: pkg.client.user.email,
        trainerName: `${pkg.trainer.user.firstName} ${pkg.trainer.user.lastName}`,
        endDate: pkg.endDate!.toISOString(),
        daysLeft,
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
