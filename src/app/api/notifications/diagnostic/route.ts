import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/notifications/diagnostic
 * Returns the status of all notification-related env vars and services.
 * Admin/trainer only — hit this in the browser or curl to diagnose issues.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Firebase Admin env vars ──────────────────────────────────────────────
  const firebaseAdmin = {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID
      ? `✓ ${process.env.FIREBASE_PROJECT_ID}`
      : '✗ MISSING',
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL
      ? `✓ ${process.env.FIREBASE_CLIENT_EMAIL}`
      : '✗ MISSING',
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY
      ? `✓ (${process.env.FIREBASE_PRIVATE_KEY.length} chars)`
      : '✗ MISSING',
  };

  // ── Firebase admin SDK init test ─────────────────────────────────────────
  let firebaseAdminInit: string;
  try {
    const { getFirebaseMessagingAdmin } = await import('@/lib/firebase-admin');
    getFirebaseMessagingAdmin();
    firebaseAdminInit = '✓ Initialized successfully';
  } catch (err) {
    firebaseAdminInit = `✗ Failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  // ── Pusher env vars + live trigger test ──────────────────────────────────
  const pusherEnv = {
    PUSHER_APP_ID: process.env.PUSHER_APP_ID ? `✓ ${process.env.PUSHER_APP_ID}` : '✗ MISSING',
    PUSHER_KEY: process.env.PUSHER_KEY ? `✓ ${process.env.PUSHER_KEY}` : '✗ MISSING',
    PUSHER_SECRET: process.env.PUSHER_SECRET ? '✓ (set)' : '✗ MISSING',
    PUSHER_CLUSTER: process.env.PUSHER_CLUSTER ? `✓ ${process.env.PUSHER_CLUSTER}` : '✗ MISSING',
    NEXT_PUBLIC_PUSHER_KEY: process.env.NEXT_PUBLIC_PUSHER_KEY
      ? `✓ ${process.env.NEXT_PUBLIC_PUSHER_KEY}`
      : '✗ MISSING',
    NEXT_PUBLIC_PUSHER_CLUSTER: process.env.NEXT_PUBLIC_PUSHER_CLUSTER
      ? `✓ ${process.env.NEXT_PUBLIC_PUSHER_CLUSTER}`
      : '✗ MISSING',
  };

  let pusherTrigger: string;
  try {
    const { triggerUserEvent } = await import('@/lib/pusher');
    await triggerUserEvent('__diagnostic__', 'NOTIFICATION', {
      id: 'diag',
      title: 'Diagnostic ping',
      body: 'Pusher connectivity test from /api/notifications/diagnostic',
    });
    pusherTrigger = '✓ SDK initialized and test event triggered successfully';
  } catch (err) {
    pusherTrigger = `✗ Failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  const pusher = { ...pusherEnv, sdkTriggerTest: pusherTrigger };

  // ── FCM tokens in DB ─────────────────────────────────────────────────────
  let fcmTokenCount: number | string;
  let fcmTokenSample: string[] | string;
  try {
    const tokens = await prisma.fcmToken.findMany({
      select: { userId: true, token: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    fcmTokenCount = await prisma.fcmToken.count();
    fcmTokenSample = tokens.map(
      (t) => `user:${t.userId} token:${t.token.slice(0, 20)}… (${t.createdAt.toISOString()})`,
    );
  } catch (err) {
    fcmTokenCount = `Error: ${err instanceof Error ? err.message : String(err)}`;
    fcmTokenSample = [];
  }

  const report = {
    timestamp: new Date().toISOString(),
    firebaseAdmin,
    firebaseAdminInit,
    pusher,
    fcmTokensInDb: {
      total: fcmTokenCount,
      recentSample: fcmTokenSample,
    },
  };

  console.log('[Diagnostic] Report generated:', JSON.stringify(report, null, 2));

  return NextResponse.json(report);
}
