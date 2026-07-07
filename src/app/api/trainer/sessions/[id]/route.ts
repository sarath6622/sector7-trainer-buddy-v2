import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole, getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { sendNotification } from '@/lib/notifications';
import { getSessionById } from '@/services/session.service';

// Trainers may only move date/time on their own sessions — never reassign to
// another trainer (that's an admin action), hence no trainerProfileId here.
const rescheduleSchema = z
  .object({
    scheduledDate: z
      .string()
      .refine((val) => !Number.isNaN(Date.parse(val)), 'Invalid date')
      .optional(),
    scheduledTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be HH:MM format')
      .optional(),
  })
  .refine((d) => d.scheduledDate || d.scheduledTime, {
    message: 'Provide a new date and/or time',
  });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 401 for no/expired session vs 403 for wrong role — lets the mobile client
    // tell "token expired → refresh & retry" from "logged in but not allowed".
    const session = await requireRole(['TRAINER', 'KICKBOXING_TRAINER']);

    const { id } = await params;
    const trainerProfileId = session.user.trainerProfileId;
    if (!trainerProfileId) {
      return NextResponse.json(
        { error: 'No trainer profile', code: 'NO_PROFILE' },
        { status: 400 },
      );
    }

    const instance = await getSessionById({
      sessionId: id,
      branchId: session.user.branchId,
      trainerProfileId,
    });

    return NextResponse.json({ data: instance });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/**
 * PATCH /api/trainer/sessions/[id]
 * Direct reschedule of the authenticated trainer's own SCHEDULED session.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const { id } = await params;
    const body = await req.json();
    const parsed = rescheduleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Scoped to the trainer's own session.
    const existing = await prisma.sessionInstance.findFirst({
      where: { id, branchId: session.user.branchId, trainerProfileId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Session not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    if (existing.status !== 'SCHEDULED') {
      return NextResponse.json(
        {
          error: `Cannot reschedule a session with status ${existing.status}`,
          code: 'INVALID_STATUS',
        },
        { status: 400 },
      );
    }

    const data: Record<string, unknown> = {};
    if (parsed.data.scheduledDate) data.scheduledDate = new Date(parsed.data.scheduledDate);
    if (parsed.data.scheduledTime) data.scheduledTime = parsed.data.scheduledTime;

    const updated = await prisma.sessionInstance.update({
      where: { id },
      data,
      include: {
        client: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
        trainer: { include: { user: { select: { id: true, firstName: true, lastName: true } } } },
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
      },
      newValue: {
        scheduledDate: updated.scheduledDate.toISOString().split('T')[0],
        scheduledTime: updated.scheduledTime,
      },
    });

    // Notify the client of the change (trainer initiated it — no self-notify).
    const sessionDateLabel = updated.scheduledDate.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const [h, m] = updated.scheduledTime.split(':');
    const hour = parseInt(h!, 10);
    const timeLabel = `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
    const trainerName = `${updated.trainer.user.firstName} ${updated.trainer.user.lastName}`;

    await sendNotification({
      branchId: session.user.branchId,
      recipientId: updated.client.user.id,
      title: `Session rescheduled — ${sessionDateLabel}`,
      body: `${trainerName} moved your session to ${sessionDateLabel} at ${timeLabel}`,
      channel: 'BOTH',
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[PATCH /api/trainer/sessions/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
