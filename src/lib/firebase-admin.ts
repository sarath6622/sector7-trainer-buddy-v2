import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

const TAG = '[Firebase Admin]';

function getFirebaseAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  console.log(`${TAG} Initializing — env check:`, {
    FIREBASE_PROJECT_ID: projectId ? `✓ ${projectId}` : '✗ MISSING',
    FIREBASE_PRIVATE_KEY: privateKey ? `✓ (${privateKey.length} chars)` : '✗ MISSING',
    FIREBASE_CLIENT_EMAIL: clientEmail ? `✓ ${clientEmail}` : '✗ MISSING',
  });

  if (!projectId || !privateKey || !clientEmail) {
    console.error(`${TAG} Cannot initialize — one or more required env vars are missing`);
    throw new Error('Firebase Admin: missing required environment variables');
  }

  try {
    const app = initializeApp({
      credential: cert({
        projectId,
        privateKey: privateKey.replace(/\\n/g, '\n'),
        clientEmail,
      }),
    });
    console.log(`${TAG} App initialized successfully (project: ${projectId})`);
    return app;
  } catch (err) {
    console.error(`${TAG} initializeApp failed:`, err);
    throw err;
  }
}

export function getFirebaseMessagingAdmin() {
  return getMessaging(getFirebaseAdminApp());
}
