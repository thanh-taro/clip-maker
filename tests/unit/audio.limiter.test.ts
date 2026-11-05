// MOD-Audio true-peak meter and limiter (ADR-0008 §3 and outcome rule 1) on synthetic overs.
import { describe, expect, it } from 'vitest';
import { BS1770_METER, SIDE_CHAIN, designInterpolator, Limiter, LIMITER_CEILING_DB, truePeak } from '../../src/audio';
import { material, SR } from '../support/audio';

/** fs/4 tone at 45° phase: every sample is ±0.707·A, the true peak is A (+3 dB over the sample peak). */
function quarterRate(amp: number, seconds: number): Float32Array {
  const x = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin((Math.PI / 2) * i + Math.PI / 4);
  return x;
}

function limit(L: Float32Array, R: Float32Array): [Float32Array, Float32Array] {
  const lim = new Limiter();
  const o = new Float64Array(3);
  const outL = new Float32Array(L.length);
  const outR = new Float32Array(L.length);
  const lat = lim.latency;
  for (let i = 0; i < L.length + lat; i++) {
    lim.push(L[i] ?? 0, R[i] ?? 0, o);
    if (i >= lat) {
      outL[i - lat] = o[0]!;
      outR[i - lat] = o[1]!;
    }
  }
  return [outL, outR];
}

describe('MOD-Audio true peak', () => {
  it('RULE-12 the meter reads the inter-sample peak of an fs/4 tone (+3 dB over its samples)', () => {
    const x = quarterRate(0.5, 0.1);
    const samplePeak = Math.max(...Array.from(x, Math.abs));
    expect(samplePeak).toBeCloseTo(0.5 * Math.SQRT1_2, 5);
    const precise = truePeak([x], designInterpolator(32, 9));
    expect(precise.peak).toBeGreaterThan(0.49);
    expect(precise.peak).toBeLessThan(0.51);
    expect(truePeak([x], BS1770_METER).peak).toBeGreaterThan(samplePeak * 1.3);
  });
});

describe('MOD-Audio limiter', () => {
  it('RULE-12 synthetic overs (+6 dBTP) come out at the −1.5 dBTP internal ceiling, ≤ −1.35 dBTP on independent meters', () => {
    // A +6 dBTP fs/4 burst inside loud material at 4× (≈ +12 dB over full scale).
    const m = material(3, 2);
    const L = new Float32Array(m.length);
    const R = new Float32Array(m.length);
    const over = quarterRate(2, 0.3);
    for (let i = 0; i < m.length; i++) {
      L[i] = 4 * m[i]!;
      R[i] = -3 * m[i]!;
    }
    L.set(over, SR);
    R.set(
      over.map((v) => -v),
      SR,
    );
    expect(truePeak([L, R]).dB).toBeGreaterThan(5);
    const [oL, oR] = limit(L, R);
    // The limiter's own 4× side-chain holds the −1.5 dBTP internal ceiling; independent meters read
    // the smoothed-gain output up to 0.15 dB higher (ADR-0008 outcome: PCM ≤ −1.35 dBTP), still
    // 0.35 dB inside RULE-12's −1 dBTP.
    expect(truePeak([oL, oR], SIDE_CHAIN).dB).toBeLessThanOrEqual(LIMITER_CEILING_DB + 0.001);
    expect(truePeak([oL, oR], BS1770_METER).dB).toBeLessThanOrEqual(-1.35);
    expect(truePeak([oL, oR], designInterpolator(32, 9)).dB).toBeLessThanOrEqual(-1.35);
  });

  it('MOD-Audio sound under the ceiling passes unchanged (gain 1, delayed by the latency)', () => {
    const x = material(1, 9).map((v) => v * 0.5);
    const [oL] = limit(x, x);
    expect(truePeak([x]).dB).toBeLessThan(-3);
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff = Math.max(diff, Math.abs(oL[i]! - x[i]!));
    expect(diff).toBe(0);
  });

  it('MOD-Audio the limiter is deterministic: two runs give identical samples', () => {
    const x = material(2, 4).map((v) => v * 5);
    const a = limit(x, x)[0];
    const b = limit(x, x)[0];
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});
