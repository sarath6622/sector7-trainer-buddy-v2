import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { toErrorResponse } from '@/lib/errors';

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { token } = await req.json();
    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Invalid token', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    await prisma.fcmToken.upsert({
      where: { token },
      create: { userId: session.user.id, token },
      update: { userId: session.user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { token } = await req.json();
    if (!token) {
      return NextResponse.json(
        { error: 'Invalid token', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    await prisma.fcmToken.deleteMany({
      where: { token, userId: session.user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
