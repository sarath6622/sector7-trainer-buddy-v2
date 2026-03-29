import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import {
  createAvailabilityOverrideSchema,
  bulkCreateAvailabilityOverrideSchema,
  listAvailabilityOverridesSchema,
} from '@/lib/validators';
import { toErrorResponse } from '@/lib/errors';
import * as overrideService from '@/services/availability-override.service';

export async function GET(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = listAvailabilityOverridesSchema.safeParse({
      trainerProfileId: searchParams.get('trainerProfileId') ?? undefined,
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = await overrideService.listOverrides({
      branchId: session.user.branchId,
      ...parsed.data,
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[GET /api/admin/availability-overrides] Error:', error);
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

    // Check if it's a bulk request
    if (body.overrides) {
      const parsed = bulkCreateAvailabilityOverrideSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
          { status: 400 },
        );
      }

      const data = await overrideService.bulkCreateOverrides({
        branchId: session.user.branchId,
        trainerProfileId: parsed.data.trainerProfileId,
        overrides: parsed.data.overrides,
        actorId: session.user.id,
      });

      return NextResponse.json({ data }, { status: 201 });
    }

    // Single override
    const parsed = createAvailabilityOverrideSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', code: 'VALIDATION_ERROR', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = await overrideService.createOverride({
      branchId: session.user.branchId,
      ...parsed.data,
      actorId: session.user.id,
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/admin/availability-overrides] Error:', error);
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
