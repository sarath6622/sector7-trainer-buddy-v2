import { NextResponse } from 'next/server';
import { getServerSession, hasRole } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE = 512 * 1024; // 512 KB

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    if (!session || !hasRole(session.user.role, ['SUPER_ADMIN', 'BRANCH_ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'File must be PNG, JPEG, or WebP', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File must be under 512 KB', code: 'VALIDATION_ERROR' },
        { status: 400 },
      );
    }

    const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1];
    const filename = `badge-${crypto.randomUUID()}.${ext}`;
    const dir = path.join(process.cwd(), 'public', 'badges');
    await mkdir(dir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buffer);

    return NextResponse.json({ url: `/badges/${filename}` }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/admin/badges/upload] Error:', error);
    return NextResponse.json({ error: 'Upload failed', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
