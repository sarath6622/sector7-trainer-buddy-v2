import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { SESSION_ROUTINE_SELECT } from '@/services/routine.service';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.roles, ['CLIENT'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const clientProfileId = session.user.clientProfileId;
    if (!clientProfileId) {
      return NextResponse.json({ error: 'No client profile', code: 'NO_PROFILE' }, { status: 400 });
    }

    const { id } = await params;

    const instance = await prisma.sessionInstance.findFirst({
      where: { id, branchId: session.user.branchId, clientProfileId },
      include: {
        // Echo the client's own id+name back. Needed by the shared
        // WorkoutLogger when the client is logging their own session
        // (ADR-036) — the logger keys exercise-history fetches on this id.
        client: {
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
        trainer: {
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        // Explicit `select`, NOT `include` (ADR-052): WorkoutLog.notes is the
        // trainer's private per-exercise note and must never reach the client
        // app. `include` returns every scalar, so it would have leaked the
        // column the moment it was added. Any new trainer-facing field on
        // WorkoutLog must be opted in here deliberately.
        workoutLogs: {
          select: {
            id: true,
            exerciseId: true,
            orderIndex: true,
            isCompleted: true,
            completedAt: true,
            createdAt: true,
            updatedAt: true,
            exercise: {
              select: {
                id: true,
                name: true,
                targetMuscleGroup: true,
                category: true,
                exerciseType: true,
              },
            },
            sets: { orderBy: { setNumber: 'asc' } },
          },
          orderBy: { orderIndex: 'asc' },
        },
        // ADR-053: routine targets render on the client's logger too (read-only
        // guidance — clients can't start a routine). Routine notes are
        // coaching cues, so unlike WorkoutLog.notes they are client-visible.
        routine: { select: SESSION_ROUTINE_SELECT },
      },
    });

    if (!instance) {
      return NextResponse.json({ error: 'Session not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({ data: instance });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
