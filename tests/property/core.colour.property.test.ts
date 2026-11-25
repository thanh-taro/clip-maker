// RULE-24 / ADR-0017 §8 property tests: range weights sum to 1, gamut reduction keeps lightness and hue,
// split toning keeps lightness in order, colour pop and the mixer never change a grey pixel.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { reference } from '../../src/compositor';
import {
  COLOUR_RANGES,
  gamutLab,
  okLch,
  oklabToLinear,
  rangeWeight,
  rangeWeights,
  splitLab,
  splitWeights,
  tintVector,
  type ColourTools,
} from '../../src/core';
import { chroma, deRgb, lab } from '../support/colour';

const value = fc.integer({ min: -100, max: 100 });
const mixer = fc.dictionary(
  fc.constantFrom(...COLOUR_RANGES),
  fc.record({ hue: value, saturation: value, lightness: value }, { requiredKeys: [] }),
);

describe('RULE-24 properties', () => {
  it('RULE-24 every hue belongs to two ranges whose weights are in [0, 1] and add up to 1', () => {
    fc.assert(
      fc.property(fc.double({ min: -720, max: 720, noNaN: true }), (h) => {
        const [, wi, , wj] = rangeWeights(h);
        expect(wi).toBeGreaterThanOrEqual(0);
        expect(wj).toBeGreaterThanOrEqual(0);
        expect(wi + wj).toBeCloseTo(1, 12);
        const all = [0, 1, 2, 3, 4, 5, 6, 7].reduce((s, r) => s + rangeWeight(r, h), 0);
        expect(all).toBeCloseTo(1, 12);
      }),
    );
  });

  it('ADR-0017 §2 gamut reduction keeps L and h and lands inside sRGB', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.02, max: 0.98, noNaN: true }),
        fc.double({ min: 0, max: 0.4, noNaN: true }),
        fc.double({ min: 0, max: 360, noNaN: true }),
        (L, C, h) => {
          const r = (h * Math.PI) / 180;
          const out = gamutLab([L, C * Math.cos(r), C * Math.sin(r)]);
          expect(out[0]).toBe(L);
          const lin = oklabToLinear(out);
          for (const x of lin) {
            expect(x).toBeGreaterThanOrEqual(-1e-4);
            expect(x).toBeLessThanOrEqual(1 + 1e-4);
          }
          if (okLch(out)[1] > 1e-3) expect(Math.abs(((okLch(out)[2] - h + 540) % 360) - 180)).toBeLessThan(1e-6);
        },
      ),
    );
  });

  it('RULE-24 split toning keeps lightness and its tone weights stay in [0, 1]', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: 0, max: 359 }),
        fc.integer({ min: 0, max: 359 }),
        (L, balance, sh, hh) => {
          const x = 0.5 - (0.3 * balance) / 100;
          const [ws, wh] = splitWeights(L, x);
          expect(ws).toBeGreaterThanOrEqual(0);
          expect(wh).toBeGreaterThanOrEqual(0);
          expect(ws + wh).toBeLessThanOrEqual(1 + 1e-12);
          expect(splitLab([L, 0, 0], tintVector(sh), tintVector(hh), x)[0]).toBe(L);
        },
      ),
    );
  });

  it('RULE-24 the mixer and colour pop never change a grey pixel by ΔE00 0.5 or more', () => {
    fc.assert(
      fc.property(
        mixer,
        fc.option(fc.constantFrom(...COLOUR_RANGES), { nil: null }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: -2, max: 2 }),
        (m, colour, range, amount, v, tint) => {
          const tools: ColourTools = { mixer: m, pop: { colour, range, amount } };
          const g = [v / 255, Math.min(1, Math.max(0, (v + tint) / 255)), v / 255] as const;
          if (chroma(lab(g)) >= 2) return;
          expect(deRgb(reference.grade(g, {}, null, null, tools), g)).toBeLessThan(0.5);
        },
      ),
      { numRuns: 300 },
    );
  });
});
