import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { createReassignmentSchema } from '@/lib/validators';
import * as reassignmentService from '@/services/reassignment.service';

/**
 * POST /api/admin/reassignments — Reassign a single session
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const input = createReassignmentSchema.parse(body);

    const reassignment = await reassignmentService.reassignSession({
      ...input,
      actorId: session.user.id,
      branchId: session.user.branchId,
    });

    return NextResponse.json({ data: reassignment }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/admin/reassignments] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

/**
 * GET /api/admin/reassignments — List reassignments
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || undefined;
    const trainerId = searchParams.get('trainerId') || undefined;

    const reassignments = await reassignmentService.listReassignments({
      branchId: session.user.branchId,
      date,
      trainerId,
    });

    return NextResponse.json({ data: reassignments });
  } catch (error) {
    console.error('[GET /api/admin/reassignments] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
