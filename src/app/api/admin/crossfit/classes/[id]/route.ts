import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { updateCrossfitClassSchema } from '@/lib/validators';
import * as crossfitService from '@/services/crossfit.service';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const input = updateCrossfitClassSchema.parse(body);

    const data = await crossfitService.updateCrossfitClass(
      id,
      input,
      session.user.branchId,
      session.user.id,
    );

    return NextResponse.json({ data });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
