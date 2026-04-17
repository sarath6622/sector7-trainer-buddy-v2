import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { bookSessionByTrainer } from '@/services/session.service';
import { z } from 'zod';

const bookSessionSchema = z.object({
  clientProfileId: z.string().min(1),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMin: z.number().int().min(15).max(180),
  notes: z.string().max(500).optional(),
});

export async function POST(req: Request) {
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

    const body = await req.json();
    const parsed = bookSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await bookSessionByTrainer({
      trainerProfileId,
      clientProfileId: parsed.data.clientProfileId,
      branchId: session.user.branchId,
      actorId: session.user.id,
      scheduledDate: parsed.data.scheduledDate,
      scheduledTime: parsed.data.scheduledTime,
      durationMin: parsed.data.durationMin,
      notes: parsed.data.notes,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
