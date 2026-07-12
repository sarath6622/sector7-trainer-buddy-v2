import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useKeyboardViewport } from '@/hooks/useKeyboardInset';

// Minimal visualViewport stand-in. jsdom doesn't implement the API, so we
// install our own and drive `resize` events by hand — exactly what iOS fires
// when the software keyboard opens/closes.
class FakeVisualViewport extends EventTarget {
  height: number;
  offsetTop = 0;
  constructor(height: number) {
    super();
    this.height = height;
  }
  resizeTo(height: number) {
    this.height = height;
    this.dispatchEvent(new Event('resize'));
  }
}

const LAYOUT_HEIGHT = 800;

describe('useKeyboardViewport', () => {
  let vv: FakeVisualViewport;

  beforeEach(() => {
    vi.stubGlobal('innerHeight', LAYOUT_HEIGHT);
    vv = new FakeVisualViewport(LAYOUT_HEIGHT);
    Object.defineProperty(window, 'visualViewport', {
      value: vv,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, 'visualViewport');
  });

  it('reports full height and zero inset while the keyboard is closed', () => {
    const { result } = renderHook(() => useKeyboardViewport());
    expect(result.current.height).toBe(LAYOUT_HEIGHT);
    expect(result.current.inset).toBe(0);
  });

  it('reports the keyboard inset when the visual viewport shrinks', () => {
    const { result } = renderHook(() => useKeyboardViewport());
    act(() => vv.resizeTo(500));
    // 800 layout − 500 visual = 300px of keyboard.
    expect(result.current.height).toBe(500);
    expect(result.current.inset).toBe(300);
  });

  it('returns to zero inset when the keyboard closes', () => {
    const { result } = renderHook(() => useKeyboardViewport());
    act(() => vv.resizeTo(500));
    act(() => vv.resizeTo(LAYOUT_HEIGHT));
    expect(result.current.inset).toBe(0);
    expect(result.current.height).toBe(LAYOUT_HEIGHT);
  });

  it('treats sub-24px diffs as jitter, not a keyboard', () => {
    const { result } = renderHook(() => useKeyboardViewport());
    act(() => vv.resizeTo(LAYOUT_HEIGHT - 10));
    expect(result.current.inset).toBe(0);
  });

  it('falls back to null height when visualViewport is unavailable', () => {
    Reflect.deleteProperty(window, 'visualViewport');
    const { result } = renderHook(() => useKeyboardViewport());
    // Callers fall back to `100dvh` on null.
    expect(result.current.height).toBeNull();
    expect(result.current.inset).toBe(0);
  });

  it('stops listening after unmount', () => {
    const { result, unmount } = renderHook(() => useKeyboardViewport());
    unmount();
    act(() => vv.resizeTo(500));
    // Last rendered value stays at the pre-unmount snapshot; no update fires.
    expect(result.current.inset).toBe(0);
  });
});
