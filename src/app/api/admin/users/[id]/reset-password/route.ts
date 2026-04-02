import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import { getServerSession, hasRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { AppError, toErrorResponse } from '@/lib/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { id } = await params;
    const { newPassword } = await req.json();

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    const user = await prisma.user.findFirst({
      where: { id, branchId: session.user.branchId, deletedAt: null },
    });

    if (!user) {
      throw new AppError('NOT_FOUND', 'User not found', 404);
    }

    const passwordHash = await hash(newPassword, 12);

    await prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    await auditLog({
      action: 'PASSWORD_RESET',
      actorId: session.user.id,
      subjectType: 'User',
      subjectId: id,
      branchId: session.user.branchId,
      newValue: { resetBy: session.user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
