'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Draggable bottom sheet with two resting heights:
//   - peek: the sheet's natural content height (capped by `peekFraction` of the
//     viewport), the size it opens at
//   - full: nearly the whole screen, reached by pulling the sheet up
// Pulling down from peek closes it; pulling down from full drops back to peek
// (or closes, on a long pull). While at peek, a drag anywhere on the sheet
// moves the sheet; once full, the body scrolls normally and only a downward
// pull from the very top of the body moves the sheet again.
//
// Rendered through a portal on <body>: outside the dashboard's PullToRefresh
// wrapper, so pulling the sheet down can't also trigger a page refresh.

type Snap = 'peek' | 'full';

const DRAG_THRESHOLD = 60; // px of travel before a release changes snap
const TOP_GAP = 56; // px left above a full sheet (status bar / notch)
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

export interface BottomSheetProps {
  onClose: () => void;
  /** Small uppercase label above the title. */
  eyebrow?: string;
  title: ReactNode;
  /** Upper bound for the peek height, as a fraction of the viewport. */
  peekFraction?: number;
  /** Body. A function receives whether the sheet is pulled up to full. */
  children: ReactNode | ((expanded: boolean) => ReactNode);
}

export function BottomSheet({
  onClose,
  eyebrow,
  title,
  peekFraction = 0.62,
  children,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [vh, setVh] = useState(0);
  const [snap, setSnap] = useState<Snap>('peek');
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  // Live drag offset (positive = finger moved down). null when not dragging.
  const [dragDy, setDragDy] = useState<number | null>(null);
  // Height of the sheet at peek, measured when a drag starts from peek.
  const [peekPx, setPeekPx] = useState(0);
  // Explicit px height while animating full → peek; peek's resting height is
  // 'auto', which CSS can't transition to, so we land on px then hand back.
  const [settlePx, setSettlePx] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; active: boolean } | null>(null);

  const fullPx = Math.max(vh - TOP_GAP, 0);
  const peekCapPx = vh * peekFraction;

  useLayoutEffect(() => {
    const update = () => setVh(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Slide in on the frame after mount so the transform transition runs.
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 260);
  }, [onClose]);

  const beginDrag = useCallback(
    (y: number) => {
      if (snap === 'peek' && sheetRef.current) setPeekPx(sheetRef.current.offsetHeight);
      dragRef.current = { startY: y, active: true };
      setDragDy(0);
    },
    [snap],
  );

  const moveDrag = useCallback((y: number) => {
    if (!dragRef.current?.active) return;
    setDragDy(y - dragRef.current.startY);
  }, []);

  const endDrag = useCallback(
    (y: number) => {
      if (!dragRef.current?.active) return;
      const dy = y - dragRef.current.startY;
      dragRef.current = null;
      setDragDy(null);
      if (dy < -DRAG_THRESHOLD) {
        setSnap('full');
      } else if (dy > DRAG_THRESHOLD) {
        if (snap === 'full' && dy < fullPx - peekPx + DRAG_THRESHOLD * 2) {
          setSnap('peek');
          setSettlePx(peekPx);
          setTimeout(() => setSettlePx(null), 320);
        } else {
          close();
        }
      }
    },
    [snap, fullPx, peekPx, close],
  );

  // Body gestures need a non-passive touchmove so the sheet can claim the
  // gesture (preventDefault) instead of the body scrolling. The listeners bind
  // once and read the latest state through a ref: re-binding mid-gesture
  // (each drag re-renders) would drop the gesture's start point.
  const gestureRef = useRef({ snap, beginDrag, moveDrag, endDrag });
  useEffect(() => {
    gestureRef.current = { snap, beginDrag, moveDrag, endDrag };
  });
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    let startY = 0;
    let claimed = false;
    const onStart = (e: TouchEvent) => {
      startY = e.touches[0]?.clientY ?? 0;
      claimed = false;
    };
    const onMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? startY;
      const dy = y - startY;
      const { snap, beginDrag, moveDrag } = gestureRef.current;
      if (!claimed) {
        const atTop = body.scrollTop <= 0;
        // At peek every vertical drag moves the sheet; at full only a pull
        // down from the top of the body does.
        if (snap === 'peek' ? Math.abs(dy) > 4 : atTop && dy > 4) {
          claimed = true;
          beginDrag(startY);
        } else {
          return;
        }
      }
      e.preventDefault();
      moveDrag(y);
    };
    const onEnd = (e: TouchEvent) => {
      if (!claimed) return;
      claimed = false;
      gestureRef.current.endDrag(e.changedTouches[0]?.clientY ?? startY);
    };
    body.addEventListener('touchstart', onStart, { passive: true });
    body.addEventListener('touchmove', onMove, { passive: false });
    body.addEventListener('touchend', onEnd);
    body.addEventListener('touchcancel', onEnd);
    return () => {
      body.removeEventListener('touchstart', onStart);
      body.removeEventListener('touchmove', onMove);
      body.removeEventListener('touchend', onEnd);
      body.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  // Height + offset. At rest the peek sheet sizes to its content (capped);
  // during a drag everything is in px so the sheet tracks the finger.
  let height: string | number = snap === 'full' ? fullPx : (settlePx ?? 'auto');
  let translate = 0;
  if (dragDy !== null) {
    const base = snap === 'full' ? fullPx : peekPx;
    const h = Math.min(base - dragDy, fullPx);
    if (h < peekPx) {
      height = peekPx;
      translate = peekPx - h;
    } else {
      height = h;
    }
  }
  const hidden = !entered || closing;
  const dragging = dragDy !== null;

  const headerHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      beginDrag(e.clientY);
    },
    onPointerMove: (e: React.PointerEvent) => moveDrag(e.clientY),
    onPointerUp: (e: React.PointerEvent) => endDrag(e.clientY),
    onPointerCancel: (e: React.PointerEvent) => endDrag(e.clientY),
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        style={{ opacity: hidden ? 0 : 1, transition: 'opacity 260ms ease' }}
        onClick={close}
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex w-full max-w-lg flex-col rounded-t-3xl bg-card pb-safe"
        style={{
          height,
          maxHeight: snap === 'full' || dragging ? fullPx : peekCapPx,
          transform: `translateY(${hidden ? '100%' : `${translate}px`})`,
          transition: dragging ? 'none' : `transform 300ms ${EASE}, height 300ms ${EASE}`,
        }}
      >
        <div className="shrink-0 touch-none select-none" {...headerHandlers}>
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>

          <div className="flex items-start justify-between px-5 pt-3 pb-4">
            <div className="min-w-0">
              {eyebrow && (
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {eyebrow}
                </p>
              )}
              <h2 className="mt-0.5 truncate text-lg font-bold">{title}</h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div
          ref={bodyRef}
          className={`min-h-0 flex-1 overscroll-contain ${
            snap === 'full' && !dragging ? 'overflow-y-auto' : 'overflow-hidden'
          }`}
        >
          {typeof children === 'function' ? children(snap === 'full') : children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
