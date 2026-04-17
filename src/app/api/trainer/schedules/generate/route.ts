import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { generateTrainerSessionsSchema } from '@/lib/validators';
import * as sessionGenService from '@/services/session-generation.service';

/**
 * POST /api/trainer/schedules/generate
 * Trainer generates monthly session instances from their own schedules.
 * Scoped to schedules where trainerProfileId = the requesting trainer.
 * Accepts optional scheduleIds to generate for specific schedules only.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['TRAINER'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const trainerProfileId = session.user.trainerProfileId;
    if (!trainerProfileId) {
      return NextResponse.json(
        { error: 'No trainer profile', code: 'NO_PROFILE' },
        { status: 400 },
      );
    }

    const body = await req.json();
    const parsed = generateTrainerSessionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // If scheduleIds provided, verify they all belong to this trainer before generating
    if (parsed.data.scheduleIds && parsed.data.scheduleIds.length > 0) {
      const { prisma } = await import('@/lib/prisma');
      const owned = await prisma.sessionSchedule.findMany({
        where: {
          id: { in: parsed.data.scheduleIds },
          branchId: session.user.branchId,
          trainerProfileId,
        },
        select: { id: true },
      });
      const ownedIds = new Set(owned.map((s) => s.id));
      const unowned = parsed.data.scheduleIds.filter((id) => !ownedIds.has(id));
      if (unowned.length > 0) {
        return NextResponse.json(
          { error: 'One or more schedule IDs do not belong to you.', code: 'FORBIDDEN' },
          { status: 403 },
        );
      }
    }

    const result = await sessionGenService.generateSessions({
      month: parsed.data.month,
      scheduleIds: parsed.data.scheduleIds,
      dryRun: parsed.data.dryRun,
      branchId: session.user.branchId,
      actorId: session.user.id,
      // Scope generation to only this trainer's schedules when no explicit list given
      trainerProfileId,
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[POST /api/trainer/schedules/generate] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
