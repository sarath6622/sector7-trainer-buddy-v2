import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    return NextResponse.json({
      data: {
        user: {
          id: session.user.id,
          email: session.user.email,
          role: session.user.role,
          branchId: session.user.branchId,
          firstName: session.user.firstName,
          lastName: session.user.lastName,
          trainerProfileId: session.user.trainerProfileId,
          clientProfileId: session.user.clientProfileId,
        },
      },
    });
  } catch (error) {
    console.error('[GET /api/auth/me] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
