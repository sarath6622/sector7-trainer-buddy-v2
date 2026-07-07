import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { toErrorResponse } from '@/lib/errors';
import { registerFcmTokenSchema } from '@/lib/validators';

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const parsed = registerFcmTokenSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid token', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }
    const { token, platform } = parsed.data;

    // platform is `undefined` for web-push; passing undefined to Prisma is a
    // no-op on update and falls back to the column default (null) on create.
    await prisma.fcmToken.upsert({
      where: { token },
      create: { userId: session.user.id, token, platform },
      update: { userId: session.user.id, platform },
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
