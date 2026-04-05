import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as crossfitService from '@/services/crossfit.service';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; attendanceId: string }> },
) {
  try {
    const session = await getServerSession();
    if (
      !session ||
      !hasRole(session.user.roles, ['CROSSFIT_TRAINER', 'SUPER_ADMIN', 'BRANCH_ADMIN'])
    ) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id, attendanceId } = await params;
    const data = await crossfitService.removeCrossfitAttendance(
      id,
      attendanceId,
      session.user.branchId,
      session.user.id,
    );

    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
