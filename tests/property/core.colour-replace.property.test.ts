// RULE-25 / ADR-0017 §8 property tests for colour replace over the sRGB cube and any settings: the effective weights
// of up to three replacements are in [0, 1] and add up to at most 1; grey pixels never change; lightness is kept.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { reference } from '../../src/compositor';
import {
  okLch,
  replaceParams,
  replaceWeights,
  srgbToOklab,
  type ColourTools,
  type ReplaceParams,
} from '../../src/core';
import { chroma, deRgb, lab, type Rgb } from '../support/colour';

const byte = fc.integer({ min: 0, max: 255 });
const hexColour = fc
  .tuple(byte, byte, byte)
  .map(([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase());
const unipolar = fc.integer({ min: 0, max: 100 });
const replacement = fc.record({ from: hexColour, to: hexColour, range: unipolar, softness: unipolar });
const tools = fc.array(replacement, { minLength: 1, maxLength: 3 }).map((replace): ColourTools => ({ replace }));
const pixel = fc.tuple(byte, byte, byte).map(([r, g, b]): Rgb => [r / 255, g / 255, b / 255]);
/** Near-neutral pixels (most with C* below 2). */
const nearGrey = fc
  .tuple(byte, fc.integer({ min: -2, max: 2 }), fc.integer({ min: -2, max: 2 }))
  .map(([v, a, b]): Rgb => [v / 255, Math.min(255, Math.max(0, v + a)) / 255, Math.min(255, Math.max(0, v + b)) / 255]);
const params = (t: ColourTools): ReplaceParams[] =>
  (t.replace ?? []).map(replaceParams).filter((p): p is ReplaceParams => p !== null);

describe('RULE-25 properties', () => {
  it('RULE-25 every effective weight is in [0, 1] and a pixel’s weights add up to at most 1', () => {
    fc.assert(
      fc.property(tools, pixel, (t, c) => {
        const w = replaceWeights(srgbToOklab(c), params(t));
        for (const x of w) expect(x >= 0 && x <= 1).toBe(true);
        expect(w.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1 + 1e-12);
      }),
      { numRuns: 400 },
    );
  });

  it('RULE-24 *Quality* RULE-25 a grey pixel (C* below 2) never changes by ΔE00 0.5 or more', () => {
    fc.assert(
      fc.property(tools, nearGrey, (t, c) => {
        fc.pre(chroma(lab(c)) < 2);
        const out = reference.grade(c, {}, null, null, t) as Rgb;
        expect(deRgb(out, c)).toBeLessThan(0.5);
      }),
      { numRuns: 300 },
    );
  });

  it('RULE-25 *Change* lightness is kept (within 0.5 on the 0–100 scale) at full precision', () => {
    fc.assert(
      fc.property(tools, pixel, (t, c) => {
        const out = reference.grade(c, {}, null, null, t) as Rgb;
        const L = (x: Rgb): number => okLch(srgbToOklab(x))[0] * 100;
        expect(Math.abs(L(out) - L(c))).toBeLessThanOrEqual(0.5);
      }),
      { numRuns: 400 },
    );
  });
});
