import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { updatePackagePlanSchema } from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import * as planService from '@/services/pt-package-plan.service';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const plan = await planService.getPlanById(id, session.user.branchId);

    return NextResponse.json({ data: plan });
  } catch (error) {
    console.error('[GET /api/admin/package-plans/[id]] Error:', error);
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
    const parsed = updatePackagePlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const plan = await planService.updatePlan(
      id,
      session.user.branchId,
      session.user.id,
      parsed.data,
    );

    return NextResponse.json({ data: plan });
  } catch (error) {
    console.error('[PUT /api/admin/package-plans/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const force = searchParams.get('force') === 'true';

    const result = await planService.deactivatePlan(
      id,
      session.user.branchId,
      session.user.id,
      force,
    );

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[DELETE /api/admin/package-plans/[id]] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
