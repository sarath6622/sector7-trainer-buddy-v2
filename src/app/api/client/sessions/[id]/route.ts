import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['CLIENT'])) {
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
        workoutLogs: {
          include: {
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
