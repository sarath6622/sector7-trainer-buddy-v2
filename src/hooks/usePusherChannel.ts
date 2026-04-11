'use client';

import { useEffect, useRef } from 'react';
import type { Channel } from 'pusher-js';
import { getPusherClient } from '@/lib/pusher-client';

/**
 * Subscribe to a Pusher channel and bind event handlers.
 *
 * @param channelName - e.g. `session-${id}` or `user-${userId}`
 * @param events - map of event name → handler function
 *
 * The hook automatically unsubscribes when the component unmounts or
 * when channelName changes.
 */
export function usePusherChannel(
  channelName: string | null | undefined,
  events: Record<string, (data: unknown) => void>,
) {
  const eventsRef = useRef(events);

  useEffect(() => {
    eventsRef.current = events;
  });

  useEffect(() => {
    if (!channelName) return;

    const pusher = getPusherClient();
    if (!pusher) return;

    const channel: Channel = pusher.subscribe(channelName);
    console.log(`[Pusher] Subscribed to channel: ${channelName}`);

    // Bind all events
    const eventNames = Object.keys(eventsRef.current);
    for (const event of eventNames) {
      channel.bind(event, (data: unknown) => {
        console.log(`[Pusher] Event received: ${event} on ${channelName}`, data);
        eventsRef.current[event]?.(data);
      });
    }

    return () => {
      for (const event of eventNames) {
        channel.unbind(event);
      }
      pusher.unsubscribe(channelName);
      console.log(`[Pusher] Unsubscribed from channel: ${channelName}`);
    };
  }, [channelName]);
}
