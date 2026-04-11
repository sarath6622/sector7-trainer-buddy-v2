'use client';

import { useEffect } from 'react';
import { getToken } from 'firebase/messaging';
import { getFirebaseMessaging } from '@/lib/firebase-client';

const TAG = '[FCM Token]';
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export function useFcmToken() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Env var check — visible in browser console
    console.log(`${TAG} Env check:`, {
      NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✓' : '✗ MISSING',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        ? '✓'
        : '✗ MISSING',
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
        ? '✓'
        : '✗ MISSING',
      NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ? '✓' : '✗ MISSING',
      NEXT_PUBLIC_FIREBASE_VAPID_KEY: VAPID_KEY ? '✓' : '✗ MISSING',
    });

    if (!VAPID_KEY) {
      console.warn(`${TAG} NEXT_PUBLIC_FIREBASE_VAPID_KEY is not set — FCM registration skipped`);
      return;
    }

    if (!('Notification' in window)) {
      console.warn(`${TAG} Notification API not available in this browser`);
      return;
    }

    async function registerToken() {
      try {
        console.log(`${TAG} Requesting notification permission…`);
        const permission = await Notification.requestPermission();
        console.log(`${TAG} Permission result: ${permission}`);
        if (permission !== 'granted') return;

        const messaging = getFirebaseMessaging();
        if (!messaging) {
          console.error(
            `${TAG} getFirebaseMessaging() returned null — Firebase client not initialized`,
          );
          return;
        }

        console.log(`${TAG} Getting FCM token from Firebase…`);
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: await navigator.serviceWorker.ready,
        });

        if (!token) {
          console.warn(`${TAG} getToken returned empty — check VAPID key and service worker`);
          return;
        }

        console.log(`${TAG} Token obtained (${token.slice(0, 20)}…) — registering with server…`);

        const res = await fetch('/api/notifications/fcm-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        if (res.ok) {
          console.log(`${TAG} Token registered successfully`);
        } else {
          const json = await res.json().catch(() => ({}));
          console.error(`${TAG} Server rejected token registration:`, res.status, json);
        }
      } catch (err) {
        console.error(`${TAG} Registration failed:`, err);
      }
    }

    void registerToken();
  }, []);
}
