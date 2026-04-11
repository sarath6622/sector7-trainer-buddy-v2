'use client';

import PusherClient from 'pusher-js';

let _client: PusherClient | null = null;

export function getPusherClient(): PusherClient | null {
  if (typeof window === 'undefined') return null;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!key || !cluster) {
    console.warn(
      '[Pusher Client] Missing env vars — NEXT_PUBLIC_PUSHER_KEY or NEXT_PUBLIC_PUSHER_CLUSTER not set',
    );
    return null;
  }

  if (_client) return _client;

  _client = new PusherClient(key, {
    cluster,
    forceTLS: true,
  });

  _client.connection.bind('connected', () => {
    console.log('[Pusher Client] Connected to Pusher');
  });

  _client.connection.bind('error', (err: unknown) => {
    console.error('[Pusher Client] Connection error:', err);
  });

  _client.connection.bind('disconnected', () => {
    console.warn('[Pusher Client] Disconnected from Pusher');
  });

  return _client;
}
