import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { createMappingSchema } from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import * as ptPackageService from '@/services/pt-package.service';

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const trainerId = searchParams.get('trainerId') ?? undefined;
    const clientId = searchParams.get('clientId') ?? undefined;

    const result = await ptPackageService.getPtPackages({
      branchId: session.user.branchId,
      trainerId,
      clientId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[GET /api/admin/mappings] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createMappingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const ptPackage = await ptPackageService.createPtPackage({
      ...parsed.data,
      branchId: session.user.branchId,
      actorId: session.user.id,
    });

    return NextResponse.json({ data: ptPackage }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/admin/mappings] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
