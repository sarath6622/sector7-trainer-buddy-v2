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

    // Latest 2 progress entries for weight/BF% trend
    const progressEntries = await prisma.progressEntry.findMany({
      where: { clientProfileId },
      orderBy: { recordedAt: 'desc' },
      take: 2,
      select: { weightKg: true, bodyFatPercent: true, muscleMass: true, recordedAt: true },
    });

    const latestProgress = progressEntries[0] ?? null;
    const prevProgress = progressEntries[1] ?? null;

    // Top PRs: max weight per exercise from all workout sets
    const prData = await prisma.workoutSet.groupBy({
      by: ['workoutLogId'],
      _max: { weightKg: true },
      where: {
        workoutLog: {
          sessionInstance: { clientProfileId, branchId },
        },
        weightKg: { not: null },
      },
    });

    // Get exercise names for each workout log
    const prLogIds = prData.map((p) => p.workoutLogId);
    const prLogs =
      prLogIds.length > 0
        ? await prisma.workoutLog.findMany({
            where: { id: { in: prLogIds } },
            select: { id: true, exercise: { select: { name: true, targetMuscleGroup: true } } },
          })
        : [];

    const logExerciseMap = new Map(prLogs.map((l) => [l.id, l.exercise]));

    // Group by exercise name, keep highest weight
    const exercisePrMap = new Map<
      string,
      { exerciseName: string; muscle: string; maxWeightKg: number }
    >();
    for (const p of prData) {
      const exercise = logExerciseMap.get(p.workoutLogId);
      if (!exercise || !p._max.weightKg) continue;
      const existing = exercisePrMap.get(exercise.name);
      if (!existing || p._max.weightKg > existing.maxWeightKg) {
        exercisePrMap.set(exercise.name, {
          exerciseName: exercise.name,
          muscle: exercise.targetMuscleGroup,
          maxWeightKg: p._max.weightKg,
        });
      }
    }

    const prs = [...exercisePrMap.values()]
      .sort((a, b) => b.maxWeightKg - a.maxWeightKg)
      .slice(0, 4);

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
        latestProgress,
        prevProgress,
        prs,
      },
    });
  } catch (error) {
    console.error('[GET /api/client/dashboard] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
