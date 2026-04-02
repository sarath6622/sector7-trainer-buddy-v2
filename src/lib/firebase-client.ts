'use client';

import { getApps, initializeApp } from 'firebase/app';
import { getMessaging, type Messaging } from 'firebase/messaging';

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

function getFirebaseApp() {
  if (!apiKey) return null;
  if (getApps().length > 0) return getApps()[0];

  return initializeApp({
    apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  });
}

let _messaging: Messaging | null = null;

export function getFirebaseMessaging(): Messaging | null {
  if (typeof window === 'undefined') return null;
  if (!apiKey) return null;
  if (_messaging) return _messaging;

  const app = getFirebaseApp();
  if (!app) return null;

  _messaging = getMessaging(app);
  return _messaging;
}
