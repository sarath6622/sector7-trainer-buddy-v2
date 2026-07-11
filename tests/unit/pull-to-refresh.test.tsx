import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PullToRefresh } from '@/components/layout/PullToRefresh';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

import { toast } from 'sonner';

function renderInScroller(onRefresh: () => void) {
  const utils = render(
    <div data-testid="scroller" style={{ overflowY: 'auto', height: 400 }}>
      <PullToRefresh onRefresh={onRefresh}>
        <div data-testid="content" style={{ height: 2000 }}>
          page content
        </div>
      </PullToRefresh>
    </div>,
  );
  const scroller = screen.getByTestId('scroller');
  const content = screen.getByTestId('content');
  return { ...utils, scroller, content };
}

function touch(x: number, y: number) {
  return { clientX: x, clientY: y };
}

function pullGesture(target: HTMLElement, from: number, to: number) {
  fireEvent.touchStart(target, { touches: [touch(0, from)] });
  fireEvent.touchMove(target, { touches: [touch(0, (from + to) / 2)] });
  fireEvent.touchMove(target, { touches: [touch(0, to)] });
  fireEvent.touchEnd(target, { touches: [] });
}

describe('PullToRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  it('triggers onRefresh when pulled past the threshold from the top', () => {
    const onRefresh = vi.fn();
    const { content } = renderInScroller(onRefresh);

    // 200px of finger travel * 0.5 damping = 100px pull, past the 70px threshold
    pullGesture(content, 10, 210);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not trigger on a short pull', () => {
    const onRefresh = vi.fn();
    const { content } = renderInScroller(onRefresh);

    // 60px travel * 0.5 = 30px pull, below the threshold
    pullGesture(content, 10, 70);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does not engage when the scroller is not at the top', () => {
    const onRefresh = vi.fn();
    const { scroller, content } = renderInScroller(onRefresh);
    scroller.scrollTop = 150;

    pullGesture(content, 10, 210);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ignores mostly-horizontal swipes', () => {
    const onRefresh = vi.fn();
    const { content } = renderInScroller(onRefresh);

    fireEvent.touchStart(content, { touches: [touch(0, 10)] });
    fireEvent.touchMove(content, { touches: [touch(300, 110)] });
    fireEvent.touchMove(content, { touches: [touch(600, 210)] });
    fireEvent.touchEnd(content, { touches: [] });

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('ignores pulls that start inside a nested scroller that is mid-scroll', () => {
    const onRefresh = vi.fn();
    render(
      <div style={{ overflowY: 'auto', height: 400 }}>
        <PullToRefresh onRefresh={onRefresh}>
          <div data-testid="inner" style={{ overflowY: 'auto', height: 200 }}>
            <div style={{ height: 1000 }}>nested list</div>
          </div>
        </PullToRefresh>
      </div>,
    );
    const inner = screen.getByTestId('inner');
    inner.scrollTop = 50;

    pullGesture(inner, 10, 210);

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('shows an offline toast instead of refreshing when offline', () => {
    const onRefresh = vi.fn();
    const { content } = renderInScroller(onRefresh);
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

    pullGesture(content, 10, 210);

    expect(onRefresh).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("You're offline", expect.anything());
  });

  it('shows the indicator while pulling and hides it when released early', () => {
    const onRefresh = vi.fn();
    const { content } = renderInScroller(onRefresh);
    const indicator = screen.getByTestId('ptr-indicator');

    expect(indicator.style.opacity).toBe('0');

    fireEvent.touchStart(content, { touches: [touch(0, 10)] });
    fireEvent.touchMove(content, { touches: [touch(0, 70)] });
    expect(Number(indicator.style.opacity)).toBeGreaterThan(0);

    fireEvent.touchEnd(content, { touches: [] });
    expect(indicator.style.opacity).toBe('0');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('only fires once while a refresh is in flight', () => {
    const onRefresh = vi.fn();
    const { content } = renderInScroller(onRefresh);

    pullGesture(content, 10, 210);
    pullGesture(content, 10, 210);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
