import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { getSessionCounts } from '@/services/session.service';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await requireRole(['CLIENT']);

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

    // Active session (IN_PROGRESS) — only today's, ignore stale sessions from past days
    const activeSession = await prisma.sessionInstance.findFirst({
      where: {
        branchId,
        clientProfileId,
        status: 'IN_PROGRESS',
        scheduledDate: { gte: today },
      },
      include: {
        trainer: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    // Trainer info from active PT package (also check endDate even if still isActive)
    const activePkg = await prisma.ptPackage.findFirst({
      where: { branchId, clientProfileId, isActive: true },
      include: {
        trainer: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
      },
    });

    // Package expiry info
    let packageExpiry: {
      daysUntilExpiry: number | null;
      isExpired: boolean;
      endDate: string | null;
      startDate: string | null;
    } = {
      daysUntilExpiry: null,
      isExpired: false,
      endDate: null,
      startDate: null,
    };

    if (activePkg?.endDate) {
      const end = new Date(
        activePkg.endDate.getFullYear(),
        activePkg.endDate.getMonth(),
        activePkg.endDate.getDate(),
      );
      const daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
      packageExpiry = {
        daysUntilExpiry: daysLeft,
        isExpired: daysLeft <= 0,
        endDate: activePkg.endDate.toISOString(),
        startDate: activePkg.startDate.toISOString(),
      };
    } else if (!activePkg) {
      // Check if there's a recently expired package
      const expiredPkg = await prisma.ptPackage.findFirst({
        where: { branchId, clientProfileId, isActive: false },
        orderBy: { endDate: 'desc' },
      });
      if (expiredPkg) {
        packageExpiry = {
          daysUntilExpiry: null,
          isExpired: true,
          endDate: expiredPkg.endDate?.toISOString() ?? null,
          startDate: expiredPkg.startDate.toISOString(),
        };
      }
    }

    // All progress entries — needed to extract per-metric latest (sparse entries)
    const allProgressEntries = await prisma.progressEntry.findMany({
      where: { clientProfileId },
      orderBy: { recordedAt: 'desc' },
      select: { weightKg: true, bodyFatPercent: true, muscleMass: true, recordedAt: true },
    });

    type ProgressKey = 'weightKg' | 'bodyFatPercent' | 'muscleMass';
    function latestOf(key: ProgressKey) {
      return allProgressEntries.find((e) => e[key] != null)?.[key] ?? null;
    }
    function previousOf(key: ProgressKey) {
      const first = allProgressEntries.findIndex((e) => e[key] != null);
      if (first < 0) return null;
      return allProgressEntries.slice(first + 1).find((e) => e[key] != null)?.[key] ?? null;
    }

    const latestProgress = {
      weightKg: latestOf('weightKg'),
      bodyFatPercent: latestOf('bodyFatPercent'),
      muscleMass: latestOf('muscleMass'),
    };
    const prevProgress = {
      weightKg: previousOf('weightKg'),
      bodyFatPercent: previousOf('bodyFatPercent'),
      muscleMass: previousOf('muscleMass'),
    };

    // ── Engagement stats ─────────────────────────────────────────────────────

    // All-time completed sessions
    const allTimeCompleted = await prisma.sessionInstance.count({
      where: { branchId, clientProfileId, status: 'COMPLETED' },
    });

    // Last completed session date → days since last session
    const lastCompleted = await prisma.sessionInstance.findFirst({
      where: { branchId, clientProfileId, status: 'COMPLETED' },
      orderBy: { scheduledDate: 'desc' },
      select: { scheduledDate: true },
    });
    // Use local date parts to avoid UTC-vs-local offset (IST = UTC+5:30)
    function localDaysSince(date: Date) {
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      return Math.round((today.getTime() - d.getTime()) / 86_400_000);
    }
    const daysSinceLastSession = lastCompleted ? localDaysSince(lastCompleted.scheduledDate) : null;

    // Attendance rate this month
    const monthAttendance =
      sessionCount.completed + sessionCount.noShow > 0
        ? Math.round(
            (sessionCount.completed / (sessionCount.completed + sessionCount.noShow)) * 100,
          )
        : null;

    // Consecutive session streak (walk backwards through completed sessions)
    const completedSessions = await prisma.sessionInstance.findMany({
      where: { branchId, clientProfileId, status: { in: ['COMPLETED', 'NO_SHOW'] } },
      orderBy: { scheduledDate: 'desc' },
      select: { scheduledDate: true, status: true },
    });
    let streak = 0;
    for (const s of completedSessions) {
      if (s.status === 'COMPLETED') streak++;
      else break; // streak broken by a no-show
    }

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
        packageExpiry,
        latestProgress,
        prevProgress,
        prs,
        engagementStats: {
          streak,
          allTimeCompleted,
          daysSinceLastSession,
          monthAttendanceRate: monthAttendance,
        },
      },
    });
  } catch (error) {
    console.error('[GET /api/client/dashboard] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
