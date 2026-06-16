import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { sendNotification } from '@/lib/notifications';

// Trainer-scoped bulk scheduling — mirrors POST /api/admin/sessions/bulk but
// takes the trainerProfileId from the session instead of the request body, and
// guards that the trainer is actually assigned to the client via an active PT
// package (trainers may only schedule for their own clients).
const bulkBookSchema = z.object({
  clientProfileId: z.string().min(1),
  dates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .min(1)
    .max(31),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMin: z.number().int().positive(),
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
    const parsed = bulkBookSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { clientProfileId, dates, startTime, durationMin } = parsed.data;
    const branchId = session.user.branchId;

    // Trainer can only schedule for a client they're assigned to via an active package.
    const assignment = await prisma.ptPackage.findFirst({
      where: { branchId, clientProfileId, trainerProfileId, isActive: true },
      select: { id: true },
    });
    if (!assignment) {
      return NextResponse.json(
        {
          error: 'You are not assigned to this client or the package is not active.',
          code: 'NOT_ASSIGNED',
        },
        { status: 403 },
      );
    }

    const [client, trainer] = await Promise.all([
      prisma.clientProfile.findFirst({
        where: { id: clientProfileId, branchId },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      }),
      prisma.trainerProfile.findFirst({
        where: { id: trainerProfileId, branchId },
        include: { user: { select: { id: true, firstName: true, lastName: true } } },
      }),
    ]);
    if (!client || !trainer) {
      return NextResponse.json(
        { error: 'Client or trainer not found', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    // Skip any already-existing non-cancelled sessions for the same pair+time on the requested dates.
    const dateObjs = dates.map((d) => new Date(d));
    const existing = await prisma.sessionInstance.findMany({
      where: {
        branchId,
        clientProfileId,
        trainerProfileId,
        scheduledDate: { in: dateObjs },
        scheduledTime: startTime,
        status: { not: 'CANCELLED' },
      },
      select: { scheduledDate: true },
    });
    const existingDateSet = new Set(
      existing.map((e) => e.scheduledDate.toISOString().split('T')[0]),
    );

    let created = 0;
    const skipped: string[] = [];

    for (const dateStr of dates) {
      if (existingDateSet.has(dateStr)) {
        skipped.push(dateStr);
        continue;
      }
      const instance = await prisma.sessionInstance.create({
        data: {
          branchId,
          clientProfileId,
          trainerProfileId,
          scheduledDate: new Date(dateStr),
          scheduledTime: startTime,
          durationMin,
          status: 'SCHEDULED',
        },
      });
      await auditLog({
        action: 'SESSION_CREATED',
        actorId: session.user.id,
        subjectType: 'SessionInstance',
        subjectId: instance.id,
        branchId,
        newValue: { clientProfileId, trainerProfileId, date: dateStr, startTime, durationMin },
      });
      created++;
    }

    // Notify the client with a summary (trainer initiated it, so no self-notification).
    if (created > 0) {
      const trainerName = `${trainer.user.firstName} ${trainer.user.lastName}`;
      const firstDate = dates.filter((d) => !skipped.includes(d)).sort()[0];
      const dateLabel = firstDate
        ? new Date(firstDate).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : '';

      await sendNotification({
        branchId,
        recipientId: client.user.id,
        title: 'Sessions scheduled',
        body: `${created} session${created !== 1 ? 's' : ''} with ${trainerName}${dateLabel ? ` • from ${dateLabel}` : ''}`,
        channel: 'BOTH',
      });
    }

    return NextResponse.json({ data: { created, skipped } }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/trainer/sessions/bulk] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
