import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import * as kickboxingService from '@/services/kickboxing.service';

export async function GET() {
  try {
    const session = await getServerSession();
    if (
      !session ||
      !hasRole(session.user.roles, ['KICKBOXING_TRAINER', 'TRAINER', 'SUPER_ADMIN', 'BRANCH_ADMIN'])
    ) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    if (!session.user.trainerProfileId) {
      return NextResponse.json(
        { error: 'Trainer profile not found', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    const data = await kickboxingService.getKickboxingClassesByTrainer(
      session.user.trainerProfileId,
      session.user.branchId,
    );

    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
