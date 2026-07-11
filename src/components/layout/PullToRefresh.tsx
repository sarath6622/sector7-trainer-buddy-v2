'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { skipSplashOnNextLoad } from '@/lib/splash';

/** Damped pull distance (px) required to trigger a refresh on release. */
const PULL_THRESHOLD = 70;
/** Cap on how far the indicator follows the finger. */
const MAX_PULL = 110;
/** Finger travel is damped by this factor for a natural rubber-band feel. */
const DAMPING = 0.5;

interface PullToRefreshProps {
  children: React.ReactNode;
  /** Called when a pull past the threshold is released. Defaults to a full page reload. */
  onRefresh?: () => void;
}

/**
 * Chrome-style pull-to-refresh for the installed PWA, where there is no
 * browser chrome and `overscroll-behavior-y: none` disables the native
 * gesture. Wrap the content of a scrollable container; the gesture engages
 * only when that container is scrolled to the top, the swipe is vertical,
 * and no nested scroller between the touch and this wrapper is mid-scroll.
 */
export function PullToRefresh({ children, onRefresh }: PullToRefreshProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Gesture state lives in refs so the native listeners (bound once) never go stale.
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const trackingRef = useRef(false);
  const pullingRef = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const findScroller = (): HTMLElement => {
      let el: HTMLElement | null = root.parentElement;
      while (el) {
        const { overflowY } = getComputedStyle(el);
        if (overflowY === 'auto' || overflowY === 'scroll') return el;
        el = el.parentElement;
      }
      return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
    };
    const scroller = findScroller();

    // A nested scroller (table, sheet, chart pane) between the touch target and
    // this wrapper that is mid-scroll must keep the gesture for itself.
    const innerScrollerEngaged = (target: EventTarget | null): boolean => {
      let el = target instanceof Element ? target : null;
      while (el && el !== root) {
        if (el.scrollTop > 0) return true;
        el = el.parentElement;
      }
      return false;
    };

    const setPullBoth = (value: number) => {
      pullRef.current = value;
      setPull(value);
    };

    const onTouchStart = (e: TouchEvent) => {
      const point = e.touches[0];
      if (refreshingRef.current || e.touches.length !== 1 || !point) return;
      if (scroller.scrollTop > 0 || innerScrollerEngaged(e.target)) {
        trackingRef.current = false;
        return;
      }
      trackingRef.current = true;
      pullingRef.current = false;
      startXRef.current = point.clientX;
      startYRef.current = point.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      const point = e.touches[0];
      if (!trackingRef.current || refreshingRef.current || !point) return;
      const dx = point.clientX - startXRef.current;
      const dy = point.clientY - startYRef.current;

      if (!pullingRef.current) {
        // Engage only on a clearly downward swipe from the very top; a
        // horizontal move (calendar/chart swipe) or upward scroll ends tracking.
        if (dy <= 0 || scroller.scrollTop > 0) {
          trackingRef.current = dy >= 0 && scroller.scrollTop <= 0;
          return;
        }
        if (Math.abs(dy) <= Math.abs(dx)) {
          trackingRef.current = false;
          return;
        }
        pullingRef.current = true;
        setDragging(true);
      }

      if (dy <= 0) {
        pullingRef.current = false;
        setDragging(false);
        setPullBoth(0);
        return;
      }

      // The pull owns this gesture — stop the scroller from rubber-banding.
      if (e.cancelable) e.preventDefault();
      setPullBoth(Math.min(dy * DAMPING, MAX_PULL));
    };

    const finishPull = (triggered: boolean) => {
      pullingRef.current = false;
      trackingRef.current = false;
      setDragging(false);
      if (!triggered) {
        setPullBoth(0);
        return;
      }
      if (!navigator.onLine) {
        toast.error("You're offline", { description: 'Reconnect to refresh.' });
        setPullBoth(0);
        return;
      }
      refreshingRef.current = true;
      setRefreshing(true);
      setPullBoth(PULL_THRESHOLD);
      const refresh =
        onRefreshRef.current ??
        (() => {
          // A refresh is not a cold start — never replay the boot splash for it.
          skipSplashOnNextLoad();
          window.location.reload();
        });
      refresh();
    };

    const onTouchEnd = () => {
      if (!pullingRef.current) {
        trackingRef.current = false;
        return;
      }
      finishPull(pullRef.current >= PULL_THRESHOLD);
    };

    const onTouchCancel = () => {
      if (pullingRef.current) finishPull(false);
      trackingRef.current = false;
    };

    root.addEventListener('touchstart', onTouchStart, { passive: true });
    root.addEventListener('touchmove', onTouchMove, { passive: false });
    root.addEventListener('touchend', onTouchEnd, { passive: true });
    root.addEventListener('touchcancel', onTouchCancel, { passive: true });
    return () => {
      root.removeEventListener('touchstart', onTouchStart);
      root.removeEventListener('touchmove', onTouchMove);
      root.removeEventListener('touchend', onTouchEnd);
      root.removeEventListener('touchcancel', onTouchCancel);
    };
  }, []);

  const visible = pull > 0 || refreshing;

  return (
    <div ref={rootRef} className="relative min-h-full">
      <div
        data-testid="ptr-indicator"
        aria-hidden={!visible}
        className="pointer-events-none absolute left-1/2 top-0 z-50"
        style={{
          transform: `translate(-50%, ${pull - 48}px)`,
          opacity: refreshing ? 1 : Math.min(pull / PULL_THRESHOLD, 1),
          transition: dragging ? 'none' : 'transform 200ms ease-out, opacity 200ms ease-out',
        }}
      >
        <div className="flex size-10 items-center justify-center rounded-full bg-card shadow-lg ring-1 ring-border/50">
          <RefreshCw
            className={`size-5 text-primary ${refreshing ? 'animate-spin' : ''}`}
            style={refreshing ? undefined : { transform: `rotate(${pull * 2.5}deg)` }}
          />
        </div>
      </div>
      {children}
    </div>
  );
}
