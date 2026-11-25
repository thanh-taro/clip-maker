// Test support: the RULE-24 *Hue ring* fixture (ADR-0017 §2, §8) — 360 colours, one per degree of
// working-space (OKLCh) hue, all at CIELAB L* 60 and C* 30 — and helpers that read it. Pure; used by the
// unit tests (CPU reference) and by the media harness (painted as a 24 × 15 patch chart).
import { okLch, RANGE_CENTRES, srgbToOklab } from '../../src/core';
import { rgbOfLab, type Rgb } from './colour';

const okHueOfLabAngle = (deg: number): number => {
  const r = (deg * Math.PI) / 180;
  return okLch(srgbToOklab(rgbOfLab([60, 30 * Math.cos(r), 30 * Math.sin(r)])))[2];
};

/** Signed hue difference a − b, in (−180, 180]. */
export function hueDiff(a: number, b: number): number {
  let d = (((a - b) % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/** The CIELAB hue angle (L* 60, C* 30) whose OKLCh hue is `h` (bisection on a bracket found by scanning). */
function labAngleFor(h: number): number {
  let prev = 0;
  let prevD = hueDiff(okHueOfLabAngle(0), h);
  for (let deg = 1; deg <= 360; deg++) {
    const d = hueDiff(okHueOfLabAngle(deg), h);
    if (prevD <= 0 && d >= 0 && d - prevD < 90) {
      let lo = prev;
      let hi = deg;
      for (let i = 0; i < 40; i++) {
        const m = 0.5 * (lo + hi);
        if (hueDiff(okHueOfLabAngle(m), h) < 0) lo = m;
        else hi = m;
      }
      return 0.5 * (lo + hi);
    }
    prev = deg;
    prevD = d;
  }
  throw new Error(`no CIELAB angle for OK hue ${h}`);
}

let ring: readonly Rgb[] | null = null;

/** Implements (test fixture): RULE-24 *Hue ring* — step k has OKLCh hue k°, CIELAB L* 60, C* 30. */
export function hueRing(): readonly Rgb[] {
  if (!ring) {
    ring = Array.from({ length: 360 }, (_, k): Rgb => {
      const r = (labAngleFor(k) * Math.PI) / 180;
      return rgbOfLab([60, 30 * Math.cos(r), 30 * Math.sin(r)]);
    });
  }
  return ring;
}

/** RULE-24: a range's *centre step*, the ring step nearest its working-space centre hue. */
export const centreStep = (range: number): number => Math.round(RANGE_CENTRES[range]!) % 360;
