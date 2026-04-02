'use client';

import { useEffect } from 'react';
import { getToken } from 'firebase/messaging';
import { getFirebaseMessaging } from '@/lib/firebase-client';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export function useFcmToken() {
  useEffect(() => {
    if (!VAPID_KEY) return; // Firebase not configured yet
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    async function registerToken() {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const messaging = getFirebaseMessaging();
        if (!messaging) return;

        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: await navigator.serviceWorker.ready,
        });

        if (!token) return;

        await fetch('/api/notifications/fcm-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
      } catch {
        // Silently fail — FCM is non-critical
      }
    }

    void registerToken();
  }, []);
}
