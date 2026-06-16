import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { toErrorResponse } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import * as ptPackageService from '@/services/pt-package.service';

// Trainer-scoped PT-package window counts — same payload as the admin route,
// but a trainer may only read counts for a package that belongs to them.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const branchId = session.user.branchId;

    const owns = await prisma.ptPackage.findFirst({
      where: { id, branchId, trainerProfileId },
      select: { id: true },
    });
    if (!owns) {
      return NextResponse.json(
        { error: 'PT package not found', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    const counts = await ptPackageService.getPackageWindowCounts(id, branchId);

    return NextResponse.json({ data: counts });
  } catch (error) {
    console.error('[GET /api/trainer/packages/[id]/window-counts] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
