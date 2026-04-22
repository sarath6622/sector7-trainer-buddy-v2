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
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // ── 1. Primary clients via PT package ──────────────────────
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

    const primaryClientIds = new Set(packages.map((p) => p.clientProfileId));

    const clientsWithStats = await Promise.all(
      packages.map(async (pkg) => {
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
          clientProfile: pkg.client,
          package: {
            id: pkg.id,
            sessionsPerMonth: pkg.sessionsPerMonth,
            sessionChargeAmount: pkg.sessionChargeAmount,
            startDate: pkg.startDate.toISOString(),
            endDate: pkg.endDate?.toISOString() ?? null,
          },
          stats: {
            totalThisMonth: sessions.length,
            completed,
            noShow,
            scheduled,
            used: completed + noShow,
            remaining: scheduled,
          },
          nextSession,
          isReassigned: false,
        };
      }),
    );

    // ── 2. Temporarily reassigned clients ──────────────────────
    // Clients who have upcoming SCHEDULED sessions assigned to this trainer
    // via a TrainerReassignment (i.e. they are NOT in this trainer's PT package)
    const reassignedSessions = await prisma.sessionInstance.findMany({
      where: {
        branchId,
        trainerProfileId,
        status: 'SCHEDULED',
        scheduledDate: { gte: today },
        trainerReassignment: { isNot: null }, // only sessions that came via reassignment
        clientProfileId: { notIn: [...primaryClientIds] }, // exclude already-listed clients
      },
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
      orderBy: [{ scheduledDate: 'asc' }, { scheduledTime: 'asc' }],
    });

    // Deduplicate by client — one card per client even if multiple sessions
    const reassignedClientMap = new Map<string, (typeof reassignedSessions)[0]>();
    for (const s of reassignedSessions) {
      if (!reassignedClientMap.has(s.clientProfileId)) {
        reassignedClientMap.set(s.clientProfileId, s);
      }
    }

    const reassignedClients = await Promise.all(
      [...reassignedClientMap.values()].map(async (s) => {
        // Fetch this client's PT package to get context (may belong to another trainer)
        const pkg = await prisma.ptPackage.findFirst({
          where: { branchId, clientProfileId: s.clientProfileId, isActive: true },
          select: {
            id: true,
            sessionsPerMonth: true,
            sessionChargeAmount: true,
            startDate: true,
            endDate: true,
          },
        });

        // All upcoming reassigned sessions for this client with this trainer
        const upcomingSessions = reassignedSessions.filter(
          (r) => r.clientProfileId === s.clientProfileId,
        );

        const nextSession = upcomingSessions[0];

        return {
          clientProfile: s.client,
          package: pkg
            ? {
                id: pkg.id,
                sessionsPerMonth: pkg.sessionsPerMonth,
                sessionChargeAmount: pkg.sessionChargeAmount,
                startDate: pkg.startDate.toISOString(),
                endDate: pkg.endDate?.toISOString() ?? null,
              }
            : null,
          stats: {
            totalThisMonth: upcomingSessions.length,
            completed: 0,
            noShow: 0,
            scheduled: upcomingSessions.length,
            used: 0,
            remaining: upcomingSessions.length,
          },
          nextSession: nextSession
            ? {
                id: nextSession.id,
                scheduledDate: nextSession.scheduledDate,
                scheduledTime: nextSession.scheduledTime,
              }
            : undefined,
          isReassigned: true,
          reassignedSessionCount: upcomingSessions.length,
        };
      }),
    );

    // ── 3. Past clients (inactive PT packages) ─────────────────
    await prisma.ptPackage.updateMany({
      where: { branchId, trainerProfileId, isActive: true, endDate: { lt: now } },
      data: { isActive: false },
    });

    const pastPackages = await prisma.ptPackage.findMany({
      where: { branchId, trainerProfileId, isActive: false },
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
      orderBy: { endDate: 'desc' },
    });

    // Deduplicate: one card per client, keeping the most recently ended package
    const seenClientIds = new Set<string>();
    const pastClients = pastPackages
      .filter((pkg) => {
        if (seenClientIds.has(pkg.clientProfileId)) return false;
        seenClientIds.add(pkg.clientProfileId);
        return true;
      })
      .map((pkg) => ({
        clientProfile: pkg.client,
        package: {
          id: pkg.id,
          sessionsPerMonth: pkg.sessionsPerMonth,
          sessionChargeAmount: pkg.sessionChargeAmount,
          endDate: pkg.endDate,
        },
      }));

    return NextResponse.json({
      data: [...clientsWithStats, ...reassignedClients],
      pastClients,
    });
  } catch (error) {
    console.error('[GET /api/trainer/clients] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
