import { afterEach, describe, expect, it, vi } from 'vitest';
import { isClearOfKeyboard, parkAboveKeyboard } from '@/components/workout/WorkoutLogger';

// jsdom has no layout, so pin the geometry each helper reads.
function rect(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: top,
    toJSON() {},
  };
}

function mount(fieldTop: number) {
  const scroller = document.createElement('div');
  scroller.style.overflowY = 'auto';
  Object.defineProperty(scroller, 'scrollHeight', { value: 2000 });
  Object.defineProperty(scroller, 'clientHeight', { value: 600 });
  scroller.getBoundingClientRect = () => rect(100, 600);
  const row = document.createElement('div'); // non-scrolling wrapper is skipped
  const field = document.createElement('input');
  field.getBoundingClientRect = () => rect(fieldTop, 44);
  row.appendChild(field);
  scroller.appendChild(row);
  document.body.appendChild(scroller);
  return { scroller, field };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('parkAboveKeyboard', () => {
  it('scrolls a low field up to the top quarter of its scroller', () => {
    const { scroller, field } = mount(600);
    scroller.scrollTop = 300;
    parkAboveKeyboard(field);
    // target = 100 + 600 * 0.25 = 250 → move by 600 - 250
    expect(scroller.scrollTop).toBe(650);
  });

  it('leaves a field that is already high alone', () => {
    const { scroller, field } = mount(200);
    scroller.scrollTop = 300;
    parkAboveKeyboard(field);
    expect(scroller.scrollTop).toBe(300);
  });

  it('does nothing without a scrollable ancestor', () => {
    const field = document.createElement('input');
    document.body.appendChild(field);
    expect(() => parkAboveKeyboard(field)).not.toThrow();
  });
});

describe('isClearOfKeyboard', () => {
  it('is true only when the field sits above the keyboard with margin', () => {
    vi.stubGlobal('visualViewport', { offsetTop: 0, height: 500 });
    const field = document.createElement('input');
    field.getBoundingClientRect = () => rect(300, 44);
    expect(isClearOfKeyboard(field)).toBe(true);
    field.getBoundingClientRect = () => rect(450, 44);
    expect(isClearOfKeyboard(field)).toBe(false);
  });
});
