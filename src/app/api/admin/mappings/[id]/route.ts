import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { updateMappingSchema } from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import * as ptPackageService from '@/services/pt-package.service';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const ptPackage = await ptPackageService.getPtPackageById(id, session.user.branchId);

    return NextResponse.json({ data: ptPackage });
  } catch (error) {
    console.error('[GET /api/admin/mappings/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const parsed = updateMappingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const ptPackage = await ptPackageService.updatePtPackage(
      id,
      session.user.branchId,
      session.user.id,
      parsed.data,
    );

    return NextResponse.json({ data: ptPackage });
  } catch (error) {
    console.error('[PUT /api/admin/mappings/[id]] Error:', error);
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
    const result = await ptPackageService.deletePtPackage(
      id,
      session.user.branchId,
      session.user.id,
    );

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[DELETE /api/admin/mappings/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
