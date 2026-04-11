/**
 * GET /api/firebase-sw
 * Serves the Firebase Messaging service worker with env vars injected at runtime.
 * This avoids the problem of NEXT_PUBLIC_ vars not being available in static SW files.
 */
export async function GET() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

  if (!apiKey || !projectId || !messagingSenderId || !appId) {
    return new Response('// Firebase config missing — SW not available', {
      status: 503,
      headers: { 'Content-Type': 'application/javascript' },
    });
  }

  const sw = `
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: ${JSON.stringify(apiKey)},
  authDomain: ${JSON.stringify(authDomain ?? '')},
  projectId: ${JSON.stringify(projectId)},
  messagingSenderId: ${JSON.stringify(messagingSenderId)},
  appId: ${JSON.stringify(appId)},
});

const messaging = firebase.messaging();

// Handle background push messages
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  if (!title) return;
  self.registration.showNotification(title, {
    body: body ?? '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
  });
});
`;

  return new Response(sw, {
    headers: {
      'Content-Type': 'application/javascript',
      // No caching — env vars must always be fresh
      'Cache-Control': 'no-store',
    },
  });
}
