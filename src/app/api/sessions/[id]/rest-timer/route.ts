import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';

// In-memory store keyed by sessionId — survives between requests on the same process
export interface RestTimerPayload {
  endTime: number | null;
  pausedRemaining: number | null;
  total: number | null;
  updatedAt: number;
}

const store = new Map<string, RestTimerPayload>();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const state = store.get(id) ?? {
    endTime: null,
    pausedRemaining: null,
    total: null,
    updatedAt: 0,
  };
  return NextResponse.json({ data: state });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = (await req.json()) as Omit<RestTimerPayload, 'updatedAt'>;
  const payload: RestTimerPayload = { ...body, updatedAt: Date.now() };
  store.set(id, payload);
  return NextResponse.json({ data: payload });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  store.delete(id);
  return NextResponse.json({ data: null });
}
