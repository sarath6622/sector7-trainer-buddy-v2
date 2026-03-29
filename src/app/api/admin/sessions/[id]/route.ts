import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { updateSessionSchema } from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { sendNotification } from '@/lib/notifications';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = updateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const existing = await prisma.sessionInstance.findFirst({
      where: { id, branchId: session.user.branchId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Session not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    if (existing.status !== 'SCHEDULED') {
      return NextResponse.json(
        { error: `Cannot edit a session with status ${existing.status}`, code: 'INVALID_STATUS' },
        { status: 400 },
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.scheduledDate) data.scheduledDate = new Date(parsed.data.scheduledDate);
    if (parsed.data.scheduledTime) data.scheduledTime = parsed.data.scheduledTime;
    if (parsed.data.trainerProfileId) data.trainerProfileId = parsed.data.trainerProfileId;

    const updated = await prisma.sessionInstance.update({
      where: { id },
      data,
      include: {
        client: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
        trainer: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
      },
    });

    await auditLog({
      action: 'SESSION_UPDATED',
      actorId: session.user.id,
      subjectType: 'SessionInstance',
      subjectId: id,
      branchId: session.user.branchId,
      oldValue: {
        scheduledDate: existing.scheduledDate.toISOString().split('T')[0],
        scheduledTime: existing.scheduledTime,
        trainerProfileId: existing.trainerProfileId,
      },
      newValue: {
        scheduledDate: updated.scheduledDate.toISOString().split('T')[0],
        scheduledTime: updated.scheduledTime,
        trainerProfileId: updated.trainerProfileId,
      },
    });

    // Build a human-readable change summary
    const changes: string[] = [];
    const oldDate = existing.scheduledDate.toISOString().split('T')[0];
    const newDate = updated.scheduledDate.toISOString().split('T')[0];
    if (oldDate !== newDate) {
      changes.push(
        `date changed to ${new Date(newDate!).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}`,
      );
    }
    if (existing.scheduledTime !== updated.scheduledTime) {
      const [h, m] = updated.scheduledTime.split(':');
      const hour = parseInt(h!, 10);
      changes.push(`time changed to ${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`);
    }
    if (existing.trainerProfileId !== updated.trainerProfileId) {
      changes.push(
        `trainer changed to ${updated.trainer.user.firstName} ${updated.trainer.user.lastName}`,
      );
    }

    if (changes.length > 0) {
      const sessionDateLabel = new Date(newDate!).toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
      const trainerName = `${updated.trainer.user.firstName} ${updated.trainer.user.lastName}`;
      const clientName = `${updated.client.user.firstName} ${updated.client.user.lastName}`;
      const changeSummary = changes.join(', ');

      await Promise.all([
        sendNotification({
          branchId: session.user.branchId,
          recipientId: updated.client.user.id,
          title: 'Session Updated',
          body: `Your session on ${sessionDateLabel} with ${trainerName} has been updated — ${changeSummary}.`,
          channel: 'BOTH',
        }),
        sendNotification({
          branchId: session.user.branchId,
          recipientId: updated.trainer.user.id,
          title: 'Session Updated',
          body: `Session with ${clientName} on ${sessionDateLabel} has been updated — ${changeSummary}.`,
          channel: 'BOTH',
        }),
      ]);
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[PATCH /api/admin/sessions/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.sessionInstance.findFirst({
      where: { id, branchId: session.user.branchId },
      include: {
        client: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        trainer: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Session not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    if (existing.status !== 'SCHEDULED') {
      return NextResponse.json(
        { error: `Cannot cancel a session with status ${existing.status}`, code: 'INVALID_STATUS' },
        { status: 400 },
      );
    }

    await prisma.sessionInstance.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    await auditLog({
      action: 'SESSION_CANCELLED',
      actorId: session.user.id,
      subjectType: 'SessionInstance',
      subjectId: id,
      branchId: session.user.branchId,
      oldValue: { status: existing.status },
      newValue: { status: 'CANCELLED' },
    });

    const sessionDateLabel = existing.scheduledDate.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const [h, m] = existing.scheduledTime.split(':');
    const hour = parseInt(h!, 10);
    const timeLabel = `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
    const trainerName = `${existing.trainer.user.firstName} ${existing.trainer.user.lastName}`;
    const clientName = `${existing.client.user.firstName} ${existing.client.user.lastName}`;

    await Promise.all([
      sendNotification({
        branchId: session.user.branchId,
        recipientId: existing.client.user.id,
        title: 'Session Cancelled',
        body: `Your session on ${sessionDateLabel} at ${timeLabel} with ${trainerName} has been cancelled.`,
        channel: 'BOTH',
      }),
      sendNotification({
        branchId: session.user.branchId,
        recipientId: existing.trainer.user.id,
        title: 'Session Cancelled',
        body: `Session with ${clientName} on ${sessionDateLabel} at ${timeLabel} has been cancelled.`,
        channel: 'BOTH',
      }),
    ]);

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('[DELETE /api/admin/sessions/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
