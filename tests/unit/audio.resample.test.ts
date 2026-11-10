// MOD-Audio — the 48 kHz resampler (ADR-0008 §2: windowed-sinc polyphase, fixed taps), against analytic
// signals: a sweep's frequency response, image and alias rejection, and bit-exact determinism.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Resampler } from '../../src/audio/resample';

const OUT = 48_000;

/** Runs the whole input through at once; output samples [0, count). */
function resampleAll(rate: number, L: Float32Array, count: number): Float32Array {
  const r = new Resampler(rate);
  r.push(0, L, L);
  r.end();
  const out = r.produce(count)!;
  return out.L.subarray(0, count);
}

/** Exponential sweep f0 → f1 over `T` seconds, amplitude A, at time t. */
const sweep = (t: number, f0: number, f1: number, T: number, A: number) => {
  const k = Math.log(f1 / f0);
  return A * Math.sin(((2 * Math.PI * f0 * T) / k) * (Math.exp((t * k) / T) - 1));
};

/** Amplitude of the component at frequency f (Hann-windowed projection). */
function amplitude(x: Float32Array, f: number, rate: number): number {
  let re = 0;
  let im = 0;
  let wsum = 0;
  for (let i = 0; i < x.length; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / x.length);
    re += w * x[i]! * Math.cos((2 * Math.PI * f * i) / rate);
    im += w * x[i]! * Math.sin((2 * Math.PI * f * i) / rate);
    wsum += w;
  }
  return (2 * Math.hypot(re, im)) / wsum;
}

const db = (x: number) => 20 * Math.log10(x);
const tone = (rate: number, f: number, seconds: number, a = 0.5) =>
  Float32Array.from({ length: Math.round(seconds * rate) }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / rate));

describe('MOD-Audio resampler (ADR-0008 §2)', () => {
  it('ADR-0008 §2 44.1 kHz → 48 kHz: a 20 Hz–19 kHz sweep matches the exact sweep within −80 dB', () => {
    const T = 2;
    const rate = 44_100;
    const x = Float32Array.from({ length: T * rate }, (_, i) => sweep(i / rate, 20, 19_000, T, 0.5));
    const y = resampleAll(rate, x, T * OUT);
    let err = 0;
    for (let k = Math.round(0.05 * OUT); k < (T - 0.05) * OUT; k++)
      err = Math.max(err, Math.abs(y[k]! - sweep(k / OUT, 20, 19_000, T, 0.5)));
    expect(db(err / 0.5)).toBeLessThan(-80);
  });

  it('ADR-0008 §2 images and aliases stay below −90 dB and the pass band is flat within 0.01 dB (common rates)', () => {
    // [input rate, tone, where its image or alias lands in the 48 kHz output]
    for (const [rate, f, image] of [
      [44_100, 15_000, 44_100 - 15_000], // image 29.1 kHz, folded to 18.9 kHz
      [44_100, 19_000, 44_100 - 19_000],
      [22_050, 9_000, 22_050 - 9_000],
      [32_000, 12_000, 32_000 - 12_000],
      [8_000, 3_000, 8_000 - 3_000],
      [96_000, 30_000, 96_000 - 30_000], // above the output Nyquist: removed (alias at 18 kHz)
    ] as const) {
      const y = resampleAll(rate, tone(rate, f, 1), OUT).subarray(2400, OUT - 2400);
      const fold = (x: number) => Math.abs(((x + 24_000) % 48_000) - 24_000);
      const kept = db(amplitude(y, fold(f), OUT) / 0.5);
      const img = db(amplitude(y, fold(image), OUT) / 0.5);
      if (f < 24_000) expect(Math.abs(kept), `${rate} Hz: ${f} Hz level`).toBeLessThan(0.01);
      else expect(kept, `${rate} Hz: ${f} Hz removed`).toBeLessThan(-90);
      expect(img, `${rate} Hz: image of ${f} Hz`).toBeLessThan(-90);
    }
  });

  it('ADR-0008 §2 48 kHz passes through bit-exact, and DC keeps unity gain at every phase', () => {
    const x = Float32Array.from({ length: 5000 }, (_, i) => Math.sin(i * 0.37) * 0.7);
    expect(resampleAll(48_000, x, 5000)).toEqual(x);
    const one = new Float32Array(44_100).fill(1);
    const y = resampleAll(44_100, one, 40_000).subarray(1000, 39_000);
    for (const v of y) expect(Math.abs(v - 1)).toBeLessThan(1e-6);
  });

  it('ADR-0008 §2 INV-02 the output is bit-exact for any split of the input and output into blocks', () => {
    const rate = 44_100;
    const x = Float32Array.from({ length: 12_000 }, (_, i) => Math.sin(i * 0.01 + Math.sin(i * 0.003)) * 0.8);
    const ref = resampleAll(rate, x, 13_000);
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 1500 }), { minLength: 1, maxLength: 40 }),
        fc.array(fc.integer({ min: 1, max: 2000 }), { minLength: 1, maxLength: 40 }),
        (ins, outs) => {
          const r = new Resampler(rate);
          const got = new Float32Array(13_000);
          let at = 0;
          let i = 0;
          let o = 0;
          const take = (limit: number) => {
            const b = r.produce(limit);
            if (b) got.set(b.L.subarray(0, Math.min(b.L.length, 13_000 - b.from)), b.from);
          };
          while (at < x.length) {
            const n = Math.min(ins[i++ % ins.length]!, x.length - at);
            r.push(at, x.subarray(at, at + n), x.subarray(at, at + n));
            at += n;
            take(Math.min(13_000, r.next + outs[o++ % outs.length]!));
          }
          r.end();
          take(13_000);
          expect(got).toEqual(ref);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('ADR-0008 outcome item 5 a resampler started later (a seek) gives the same samples once its support is decoded', () => {
    const rate = 44_100;
    const x = Float32Array.from({ length: 44_100 }, (_, i) => Math.sin(i * 0.05) * 0.5 + Math.sin(i * 0.31) * 0.2);
    const ref = resampleAll(rate, x, 48_000);
    const start = 20_000; // input sample where the later decode starts
    const r = new Resampler(rate);
    r.next = r.firstOutputFrom(start);
    r.push(start, x.subarray(start), x.subarray(start));
    r.end();
    const b = r.produce(48_000)!;
    expect(b.from).toBe(Math.ceil(((start + r.before - 1) * 160) / 147));
    expect(b.L).toEqual(ref.subarray(b.from, 48_000));
  });

  it('ADR-0008 §2 a gap in the input is silence, input before what was given is skipped', () => {
    const r = new Resampler(48_000);
    r.push(0, new Float32Array([1, 2]), new Float32Array([1, 2]));
    r.push(4, new Float32Array([5, 6]), new Float32Array([5, 6]));
    r.push(5, new Float32Array([9, 7]), new Float32Array([9, 7]));
    r.end();
    expect(Array.from(r.produce()!.L)).toEqual([1, 2, 0, 0, 5, 6, 7]);
  });
});
