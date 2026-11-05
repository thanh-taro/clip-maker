// MOD-Audio streaming true-peak meter = the whole-signal meter (ADR-0008 outcome item 2: the
// verify-and-trim pass measures a decoded export block by block).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { SIDE_CHAIN, truePeak, TruePeakMeter } from '../../src/audio';

describe('MOD-Audio TruePeakMeter', () => {
  it('ADR-0008 outcome item 2 the block-wise true peak equals the whole-signal BS.1770 true peak for any block split', () => {
    fc.assert(
      fc.property(
        fc.array(fc.float({ min: -1, max: 1, noNaN: true }), { minLength: 1, maxLength: 300 }),
        fc.array(fc.integer({ min: 1, max: 40 }), { minLength: 1, maxLength: 20 }),
        (samples, sizes) => {
          const L = Float32Array.from(samples);
          const R = Float32Array.from(samples.map((x, i) => (i % 3 ? -x : x * 0.5)));
          const meter = new TruePeakMeter();
          for (let at = 0, b = 0; at < L.length; b++) {
            const n = Math.min(sizes[b % sizes.length]!, L.length - at);
            meter.push([L.subarray(at, at + n), R.subarray(at, at + n)]);
            at += n;
          }
          expect(meter.finish().peak).toBeCloseTo(truePeak([L, R]).peak, 6);
        },
      ),
    );
  });

  it('ADR-0008 outcome item 2 the streaming meter also matches with another interpolator', () => {
    const L = Float32Array.from({ length: 997 }, (_, i) => Math.sin(i * 2.9) * 0.9);
    const meter = new TruePeakMeter(SIDE_CHAIN);
    for (let at = 0; at < L.length; at += 64) meter.push([L.subarray(at, at + 64)]);
    expect(meter.finish().peak).toBeCloseTo(truePeak([L], SIDE_CHAIN).peak, 6);
  });
});
