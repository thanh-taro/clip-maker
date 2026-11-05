// MOD-Audio WSOLA time-stretch (ADR-0008 §4 and outcome rules 4–5) against analytic signals.
import { describe, expect, it } from 'vitest';
import { RULE_06 } from '../../src/core';
import { createStretcher, pcmSource, seekDecodeFrom, type SoundSource } from '../../src/audio';
import { hash, material, peakFrequency, rng, sine, SR } from '../support/audio';

const QUICK_SPEEDS = RULE_06.quickPct.map((p) => p / 100);

function renderAll(src: SoundSource, origin: number, speed: number, count: number, block = 1024) {
  const st = createStretcher(src, origin, speed);
  const L = new Float32Array(count);
  const R = new Float32Array(count);
  for (let i = 0; i < count; i += block) {
    const n = Math.min(block, count - i);
    st.render(i, L.subarray(i, i + n), R.subarray(i, i + n));
  }
  return { L, R };
}

describe('MOD-Audio WSOLA', () => {
  const tone = sine(440, 20, 0.5);
  const src = pcmSource(tone, tone);

  for (const speed of QUICK_SPEEDS) {
    it(`F-005.AC2 RULE-06 a 440 Hz tone stays 440 Hz ± 1 % at ${speed}× in the shared preview/export render (${speed}×)`, () => {
      const out = renderAll(src, 0, speed, Math.round(2 * SR));
      // Two seconds of output, sync frames included.
      const f = peakFrequency(out.L.subarray(SR / 4, SR / 4 + SR), 400, 480);
      expect(Math.abs(f - 440) / 440).toBeLessThan(0.01);
      expect(Math.abs(f - 440) / 440).toBeLessThan(0.0005); // SP-timestretch measured 0.001 %
    });
  }

  it('RULE-06 the output lasts the source range divided by the speed (a 2 s tone at 2× fills 1 s)', () => {
    const short = sine(440, 2, 0.5);
    const out = renderAll(pcmSource(short), 0, 2, 2 * SR);
    const level = (a: number, b: number) => Math.max(...Array.from(out.L.subarray(a, b), Math.abs));
    expect(level(SR / 10, SR - SR / 10)).toBeGreaterThan(0.4);
    expect(level(SR + SR / 10, 2 * SR)).toBe(0);
  });

  it('MOD-Audio 1× bypasses the stretch: the source samples are copied from the in point', () => {
    const x = material(3, 7);
    const out = renderAll(pcmSource(x), 4800, 1, SR);
    expect(Array.from(out.L)).toEqual(Array.from(x.subarray(4800, 4800 + SR)));
  });

  it('INV-02 any output range renders bit-exact from any seek order and block size (WSOLA sync frames)', () => {
    const x = material(12, 3);
    const y = material(12, 4);
    const s = pcmSource(x, y);
    for (const speed of [0.25, 0.5, 0.7, 1.5, 2, 4]) {
      const count = Math.floor((x.length - 2 * SR) / speed);
      const total = Math.min(count, 6 * SR);
      const ref = renderAll(s, 1234, speed, total, 1600);
      const st = createStretcher(s, 1234, speed);
      const r = rng(Math.round(speed * 100));
      for (let k = 0; k < 12; k++) {
        const from = Math.floor(r() * (total - 5000));
        const n = 1 + Math.floor(r() * 4800);
        const L = new Float32Array(n);
        const R = new Float32Array(n);
        st.render(from, L, R);
        expect(hash(L, R), `speed ${speed} from ${from}`).toBe(
          hash(ref.L.slice(from, from + n), ref.R.slice(from, from + n)),
        );
      }
      // And a fresh stretcher rendering with another block size.
      const other = renderAll(s, 1234, speed, total, 777);
      expect(hash(other.L, other.R)).toBe(hash(ref.L, ref.R));
    }
  });

  it('MOD-Audio after a seek, decoding from the previous sync point minus 32 ms is enough', () => {
    const x = material(20, 5);
    for (const speed of [0.25, 0.5, 2, 4]) {
      for (const outFrom of [0, 30_000, SR * 2 + 17, SR * 3 - 1]) {
        let lowest = Infinity;
        const watched: SoundSource = {
          length: x.length,
          read(from, L, R) {
            lowest = Math.min(lowest, from);
            pcmSource(x).read(from, L, R);
          },
        };
        const st = createStretcher(watched, 0, speed);
        st.render(outFrom, new Float32Array(2048), new Float32Array(2048));
        expect(lowest, `speed ${speed} at ${outFrom}`).toBeGreaterThanOrEqual(seekDecodeFrom(speed, outFrom));
        expect(seekDecodeFrom(speed, outFrom)).toBeGreaterThanOrEqual(
          Math.round(Math.floor(outFrom / SR) * SR * speed) - Math.round(0.032 * SR),
        );
      }
    }
  });
});
