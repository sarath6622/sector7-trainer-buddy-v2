import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { bulkCreateSessionsSchema } from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { sendNotification } from '@/lib/notifications';

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = bulkCreateSessionsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { clientProfileId, trainerProfileId, dates, startTime, durationMin } = parsed.data;
    const branchId = session.user.branchId;

    // Verify both profiles exist and belong to this branch
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

    // Find any already-existing non-cancelled sessions for the same pair+time on the requested dates
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

    // Notify client and trainer with a summary
    if (created > 0) {
      const trainerName = `${trainer.user.firstName} ${trainer.user.lastName}`;
      const clientName = `${client.user.firstName} ${client.user.lastName}`;
      const firstDate = dates.filter((d) => !skipped.includes(d)).sort()[0];
      const dateLabel = firstDate
        ? new Date(firstDate).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : '';

      await Promise.all([
        sendNotification({
          branchId,
          recipientId: client.user.id,
          title: 'Sessions Scheduled',
          body: `${created} session${created !== 1 ? 's' : ''} scheduled with ${trainerName}${dateLabel ? ` starting ${dateLabel}` : ''}.`,
          channel: 'BOTH',
        }),
        sendNotification({
          branchId,
          recipientId: trainer.user.id,
          title: 'Sessions Scheduled',
          body: `${created} session${created !== 1 ? 's' : ''} with ${clientName} scheduled${dateLabel ? ` starting ${dateLabel}` : ''}.`,
          channel: 'BOTH',
        }),
      ]);
    }

    return NextResponse.json({ data: { created, skipped } }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/admin/sessions/bulk] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
