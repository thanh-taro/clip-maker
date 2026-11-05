// MOD-App — the info notice's auto-hide timer (CMP-Notice "Behavior", WCAG 2.2.1): 8 s, held while the
// notice is hovered or focused; hover and focus are tracked apart. Fake timers.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HideTimer, INFO_HIDE_MS } from '../../src/app/hide-timer';

let hidden = 0;
let t: HideTimer;

beforeEach(() => {
  vi.useFakeTimers();
  hidden = 0;
  t = new HideTimer(INFO_HIDE_MS, () => hidden++);
});
afterEach(() => {
  t.stop();
  vi.useRealTimers();
});

describe('CMP-Notice info auto-hide (F-023 COPY-notice.slow_device)', () => {
  it('F-023.AC6 the slow-device notice hides by itself after 8 s', () => {
    expect(INFO_HIDE_MS).toBe(8000);
    t.start();
    vi.advanceTimersByTime(INFO_HIDE_MS - 1);
    expect(hidden).toBe(0);
    vi.advanceTimersByTime(1);
    expect(hidden).toBe(1);
  });

  it('CMP-Notice hovering holds the timer; leaving restarts the full time', () => {
    t.start();
    vi.advanceTimersByTime(5000);
    t.hover(true);
    vi.advanceTimersByTime(60_000);
    expect(hidden).toBe(0);
    t.hover(false);
    vi.advanceTimersByTime(INFO_HIDE_MS - 1);
    expect(hidden).toBe(0);
    vi.advanceTimersByTime(1);
    expect(hidden).toBe(1);
  });

  it('CMP-Notice focus inside holds the timer', () => {
    t.start();
    t.focus(true);
    vi.advanceTimersByTime(60_000);
    expect(hidden).toBe(0);
    t.focus(false);
    vi.advanceTimersByTime(INFO_HIDE_MS);
    expect(hidden).toBe(1);
  });

  it('CMP-Notice the pointer leaving while focus stays inside keeps the timer held', () => {
    t.start();
    t.focus(true);
    t.hover(true);
    t.hover(false);
    vi.advanceTimersByTime(60_000);
    expect(hidden).toBe(0);
    t.focus(false);
    vi.advanceTimersByTime(INFO_HIDE_MS);
    expect(hidden).toBe(1);
  });
});
