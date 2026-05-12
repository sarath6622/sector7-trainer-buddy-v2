import { NextRequest, NextResponse } from 'next/server';
import { assertTvOrAdmin } from '@/lib/tv-auth';
import { toErrorResponse } from '@/lib/errors';
import * as tvLiveService from '@/services/tv-live.service';

export async function GET(request: NextRequest) {
  try {
    const ctx = await assertTvOrAdmin(request);
    const payload = await tvLiveService.getTvLive({ branchId: ctx.branchId });
    return NextResponse.json({ data: payload });
  } catch (error) {
    const { error: msg, code, status } = toErrorResponse(error);
    return NextResponse.json({ error: msg, code }, { status });
  }
}
