// MOD-Core frame-time maths across 24/25/30/60 fps (rules.md "Frame times"; ADR-0016 property tests).
import fc from 'fast-check';
import { expect, it } from 'vitest';
import {
  frameIndexAt,
  frameStart,
  framesOf,
  minFrames,
  nearestFrame,
  pickedFrames,
  snapToFrame,
  type FrameRate,
} from '../../src/core';

const rate = fc.constantFrom<FrameRate>(24, 25, 30, 60);
const frame = fc.integer({ min: 0, max: 60 * 600 + 10 });
const time = fc.integer({ min: 0, max: 700_000_000 });

it('MOD-Core frame starts are strictly increasing and a stored n-frame duration counts back as n', () => {
  fc.assert(
    fc.property(rate, frame, (r, k) => {
      expect(frameStart(k + 1, r)).toBeGreaterThan(frameStart(k, r));
      expect(framesOf(frameStart(k, r), r)).toBe(k);
      expect(frameIndexAt(frameStart(k, r), r)).toBe(k);
    }),
  );
});

it('MOD-Core snapping goes to the nearest frame start, halfway to the earlier, and is idempotent', () => {
  fc.assert(
    fc.property(rate, time, (r, t) => {
      const s = snapToFrame(t, r);
      const k = nearestFrame(t, r);
      expect(s).toBe(frameStart(k, r));
      expect(snapToFrame(s, r)).toBe(s);
      const prev = frameStart(Math.max(0, k - 1), r);
      const next = frameStart(k + 1, r);
      expect(Math.abs(t - s)).toBeLessThanOrEqual(Math.abs(t - next));
      if (k > 0) expect(Math.abs(t - s)).toBeLessThan(Math.abs(t - prev));
    }),
  );
});

it('MOD-Core a duration picked in 0.1 s steps is the nearest whole frame count, never below the minimum', () => {
  fc.assert(
    fc.property(rate, fc.integer({ min: 0, max: 600 }), (r, tenths) => {
      const n = pickedFrames(tenths, r, minFrames(r));
      expect(n).toBeGreaterThanOrEqual(minFrames(r));
      const exact = (tenths * r) / 10;
      if (exact >= minFrames(r)) expect(Math.abs(n - exact)).toBeLessThanOrEqual(0.5);
    }),
  );
});
