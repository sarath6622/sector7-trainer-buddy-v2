import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/admin/clients/expiring?days=10
 * Returns active PT packages running out either by time OR by sessions
 * consumed. A package is "expiring" if days-remaining ≤ `days` OR
 * sessions-remaining ≤ the equivalent of `days` worth of sessions
 * (using `sessionsPerMonth` as sessions-per-30-days).
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
        endDate: { gte: now },
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

    if (packages.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Fetch all consumed sessions across the relevant client+window space in
    // one go, then aggregate in memory per package.
    const clientIds = Array.from(new Set(packages.map((p) => p.clientProfileId)));
    const minStart = new Date(Math.min(...packages.map((p) => p.startDate.getTime())));
    const maxEnd = new Date(Math.max(...packages.map((p) => (p.endDate ?? now).getTime())));

    const sessions = await prisma.sessionInstance.findMany({
      where: {
        branchId: session.user.branchId,
        clientProfileId: { in: clientIds },
        status: { in: ['COMPLETED', 'NO_SHOW'] },
        scheduledDate: { gte: minStart, lte: maxEnd },
      },
      select: { clientProfileId: true, scheduledDate: true },
    });

    const data = packages
      .map((pkg) => {
        const end = pkg.endDate!;
        const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86_400_000));

        const used =
          sessions.filter(
            (s) =>
              s.clientProfileId === pkg.clientProfileId &&
              s.scheduledDate >= pkg.startDate &&
              s.scheduledDate <= end,
          ).length + pkg.onboardingUsedSessions;
        const sessionsLeft = Math.max(0, pkg.totalSessions - used);

        // Day-equivalent threshold for sessions (sessionsPerMonth treats a
        // "month" as 30 days per PRD).
        const sessionThreshold =
          pkg.sessionsPerMonth > 0
            ? Math.max(1, Math.ceil((pkg.sessionsPerMonth * days) / 30))
            : days;

        const timeTriggered = end <= cutoff;
        const sessionTriggered = pkg.totalSessions > 0 && sessionsLeft <= sessionThreshold;

        if (!timeTriggered && !sessionTriggered) return null;

        const reason: 'time' | 'sessions' | 'both' =
          timeTriggered && sessionTriggered ? 'both' : sessionTriggered ? 'sessions' : 'time';

        return {
          packageId: pkg.id,
          clientName: `${pkg.client.user.firstName} ${pkg.client.user.lastName}`,
          clientEmail: pkg.client.user.email,
          trainerName: `${pkg.trainer.user.firstName} ${pkg.trainer.user.lastName}`,
          endDate: end.toISOString(),
          daysLeft,
          totalSessions: pkg.totalSessions,
          usedSessions: used,
          sessionsLeft,
          reason,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null)
      // Surface most-urgent first: lowest of (days, sessions-as-days)
      .sort((a, b) => {
        const aDayEq = Math.min(a.daysLeft, a.sessionsLeft * (30 / Math.max(1, days)));
        const bDayEq = Math.min(b.daysLeft, b.sessionsLeft * (30 / Math.max(1, days)));
        return aDayEq - bDayEq;
      });

    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
