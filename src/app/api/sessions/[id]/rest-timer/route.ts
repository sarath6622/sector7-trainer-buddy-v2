import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { assertSessionAccess } from '@/services/session.service';
import { restTimerStateSchema } from '@/lib/validators';
import { AppError, toErrorResponse } from '@/lib/errors';
import { triggerRestTimerEvent } from '@/lib/pusher';
import type { RestTimer } from '@prisma/client';

// ─── Wire shape ──────────────────────────────────────────────────────────────
// What clients send/receive. The DB stores `endTime` as a Date and the wire
// uses ms-since-epoch so the existing `useRestTimer` hook (which does
// arithmetic in ms) doesn't need to change.

export interface RestTimerPayload {
  endTime: number | null;
  pausedRemaining: number | null;
  total: number | null;
  updatedAt: number;
}

const EMPTY: RestTimerPayload = {
  endTime: null,
  pausedRemaining: null,
  total: null,
  updatedAt: 0,
};

function toWire(row: RestTimer): RestTimerPayload {
  return {
    endTime: row.endTime ? row.endTime.getTime() : null,
    pausedRemaining: row.pausedRemainingSec,
    total: row.totalSec,
    updatedAt: row.updatedAt.getTime(),
  };
}

// ─── Auth ────────────────────────────────────────────────────────────────────

async function authorize(sessionId: string) {
  const session = await getServerSession();
  if (!session) {
    throw new AppError('UNAUTHORIZED', 'Unauthorized', 401);
  }
  const { branchId, trainerProfileId, clientProfileId, id: userId } = session.user;
  if (!branchId) {
    throw new AppError('NO_BRANCH', 'User has no branch', 400);
  }
  await assertSessionAccess({
    sessionId,
    branchId,
    trainerProfileId: trainerProfileId ?? null,
    clientProfileId: clientProfileId ?? null,
  });
  return { userId, branchId };
}

function actionFor(payload: RestTimerPayload, prev: RestTimerPayload | null): string {
  if (payload.endTime !== null) {
    return prev && prev.pausedRemaining !== null ? 'REST_TIMER_RESUME' : 'REST_TIMER_START';
  }
  if (payload.pausedRemaining !== null) return 'REST_TIMER_PAUSE';
  return 'REST_TIMER_UPDATE';
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await authorize(id);
    const row = await prisma.restTimer.findUnique({ where: { sessionInstanceId: id } });
    return NextResponse.json({
      data: row ? toWire(row) : EMPTY,
      serverNow: Date.now(),
    });
  } catch (err) {
    const r = toErrorResponse(err);
    return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId, branchId } = await authorize(id);

    const body = await req.json();
    const input = restTimerStateSchema.parse(body);
    if (input.total === null) {
      throw new AppError('INVALID_TOTAL', 'total is required when starting/pausing a timer', 422);
    }

    const prevRow = await prisma.restTimer.findUnique({ where: { sessionInstanceId: id } });
    const prev = prevRow ? toWire(prevRow) : null;

    const row = await prisma.restTimer.upsert({
      where: { sessionInstanceId: id },
      create: {
        sessionInstanceId: id,
        branchId,
        endTime: input.endTime !== null ? new Date(input.endTime) : null,
        pausedRemainingSec: input.pausedRemaining,
        totalSec: input.total,
        startedByUserId: userId,
      },
      update: {
        endTime: input.endTime !== null ? new Date(input.endTime) : null,
        pausedRemainingSec: input.pausedRemaining,
        totalSec: input.total,
        startedByUserId: userId,
      },
    });
    const payload = toWire(row);
    const serverNow = Date.now();

    await Promise.all([
      auditLog({
        action: actionFor(payload, prev),
        actorId: userId,
        subjectType: 'SessionInstance',
        subjectId: id,
        branchId,
        oldValue: prev ? { ...prev } : undefined,
        newValue: { ...payload },
      }),
      triggerRestTimerEvent(id, { ...payload, serverNow }),
    ]);

    return NextResponse.json({ data: payload, serverNow });
  } catch (err) {
    if (err instanceof ZodError) {
      console.error(
        '[PUT /api/sessions/[id]/rest-timer] Invalid payload:',
        JSON.stringify(err.issues),
      );
      return NextResponse.json(
        { error: 'Invalid payload', code: 'VALIDATION_ERROR', issues: err.issues },
        { status: 422 },
      );
    }
    const r = toErrorResponse(err);
    return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { userId, branchId } = await authorize(id);

    // deleteMany so a missing row is a no-op instead of a P2025; lets concurrent
    // DELETE calls (e.g. trainer + client both press Stop) settle cleanly.
    const prevRow = await prisma.restTimer.findUnique({ where: { sessionInstanceId: id } });
    await prisma.restTimer.deleteMany({ where: { sessionInstanceId: id } });

    const serverNow = Date.now();
    const cleared: RestTimerPayload = {
      endTime: null,
      pausedRemaining: null,
      total: null,
      updatedAt: serverNow,
    };
    await Promise.all([
      prevRow
        ? auditLog({
            action: 'REST_TIMER_STOP',
            actorId: userId,
            subjectType: 'SessionInstance',
            subjectId: id,
            branchId,
            oldValue: { ...toWire(prevRow) },
          })
        : Promise.resolve(),
      triggerRestTimerEvent(id, { ...cleared, serverNow }),
    ]);

    return NextResponse.json({ data: null });
  } catch (err) {
    const r = toErrorResponse(err);
    return NextResponse.json({ error: r.error, code: r.code }, { status: r.status });
  }
}
