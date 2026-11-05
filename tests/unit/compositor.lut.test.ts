// MOD-Compositor look tables (ADR-0007 §3 and outcome rule 3): strip packing, trilinear lookup maths.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { identityTable, LUT_BYTES, LUT_N, lutSample, stripFromTable, tableFromStrip } from '../../src/compositor';
import { deRgb } from '../support/colour';

const unit = fc.double({ min: 0, max: 1, noNaN: true });

describe('ADR-0007 look tables', () => {
  it('ADR-0007 the identity table holds each node’s colour at 8 bits', () => {
    const t = identityTable();
    expect(t.length).toBe(LUT_BYTES);
    // Node (r, g, b) = (32, 0, 16): index ((16·33 + 0)·33 + 32)·4.
    const i = ((16 * LUT_N + 0) * LUT_N + 32) * 4;
    expect([t[i], t[i + 1], t[i + 2], t[i + 3]]).toEqual([255, 0, 128, 255]);
  });

  it('ADR-0007 a strip (x = r + 33·b, y = g) packs and unpacks to the same table', () => {
    const t = identityTable();
    for (let i = 0; i < t.length; i += 4) t[i] = (i / 4) % 251; // a non-trivial red channel
    const strip = stripFromTable(t);
    expect(strip.length).toBe(33 * 33 * 33 * 4);
    expect(tableFromStrip(strip, 33 * 33, 33)).toEqual(t);
    // Pixel (x = r + 33·b, y = g) holds node (r, g, b).
    const [r, g, b] = [5, 7, 9];
    const s = (g * 33 * 33 + b * 33 + r) * 4;
    const o = ((b * 33 + g) * 33 + r) * 4;
    expect(strip[s]).toBe(t[o]);
  });

  it('ADR-0007 a strip of the wrong size is refused', () => {
    expect(() => tableFromStrip(new Uint8Array(16), 2, 2)).toThrow(RangeError);
  });

  it('RULE-09 the identity table returns the input within 8-bit storage error (ΔE00 < 0.5)', () => {
    fc.assert(
      fc.property(unit, unit, unit, (r, g, b) => {
        const out = lutSample(identityTable(), [r, g, b]);
        expect(deRgb(out, [r, g, b])).toBeLessThan(0.5);
      }),
      { numRuns: 300 },
    );
  });

  it('ADR-0007 trilinear lookup hits nodes exactly and is linear between two nodes on one axis', () => {
    const t = identityTable();
    for (let i = 0; i < t.length; i += 4) t[i] = 255 - t[i]!; // invert red
    const s = LUT_N - 1;
    expect(lutSample(t, [0, 0, 0])[0]).toBeCloseTo(1, 6);
    expect(lutSample(t, [1, 0, 0])[0]).toBeCloseTo(0, 6);
    const a = lutSample(t, [3 / s, 0.5, 0.5])[0];
    const b = lutSample(t, [4 / s, 0.5, 0.5])[0];
    expect(lutSample(t, [3.5 / s, 0.5, 0.5])[0]).toBeCloseTo((a + b) / 2, 6);
  });

  it('ADR-0007 lookups outside [0, 1] are clamped to the table', () => {
    expect(lutSample(identityTable(), [-1, 2, 0.5])).toEqual(lutSample(identityTable(), [0, 1, 0.5]));
  });
});
