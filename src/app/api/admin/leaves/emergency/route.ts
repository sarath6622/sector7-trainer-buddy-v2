import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { z } from 'zod';
import * as leaveService from '@/services/leave.service';

const markEmergencySchema = z.object({
  trainerProfileId: z.string().cuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().optional(),
});

/**
 * POST /api/admin/leaves/emergency — Admin marks a trainer on emergency leave (directly approved)
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const input = markEmergencySchema.parse(body);

    const leave = await leaveService.adminMarkEmergencyLeave({
      trainerProfileId: input.trainerProfileId,
      date: input.date,
      notes: input.notes,
      actorId: session.user.id,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: leave }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/admin/leaves/emergency] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
