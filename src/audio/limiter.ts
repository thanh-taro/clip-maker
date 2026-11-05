// MOD-Audio — the look-ahead true-peak limiter (ADR-0008 §3, outcome rule 1). Promoted from
// spike/audio (spikes/audio/public/dsp.js). Deterministic, no randomness, float64 state.
// Implements: RULE-12 Mix ("a limiter that keeps the true peak at or below −1 dBTP"), F-011.R5.
import { SAMPLE_RATE } from '../plan';
import { linearOf, SIDE_CHAIN, type Interpolator } from './truepeak';

export interface LimiterOptions {
  /** Internal ceiling (ADR-0008 outcome: −1.5 dBTP, leaving 0.5 dB under the −1 dBTP rule). */
  readonly ceilingDb?: number;
  /** Look-ahead in samples (5 ms). */
  readonly lookahead?: number;
  readonly releaseMs?: number;
  readonly detector?: Interpolator;
}

export const LIMITER_CEILING_DB = -1.5;
export const LIMITER_LOOKAHEAD = Math.round(0.005 * SAMPLE_RATE);
export const LIMITER_RELEASE_MS = 80;

/**
 * Per output sample k:
 *   req[k]  = min(1, ceiling / truePeakEstimate(k))     (4× side-chain)
 *   gmin[k] = min(req[k .. k+L])                         (look-ahead hold)
 *   h[k]    = min(gmin[k], h[k−1] + (1 − h[k−1]) · rel)  (release toward 1)
 *   gain[k] = mean(h[k−L .. k])                          (box smoothing, ≤ req at every peak)
 * Latency = L + M samples; the mixer compensates so its output is aligned to project time.
 */
export class Limiter {
  readonly latency: number;
  private readonly c: number;
  private readonly L: number;
  private readonly M: number;
  private readonly rel: number;
  private readonly phases: readonly Float64Array[];
  private histL!: Float64Array;
  private histR!: Float64Array;
  private hp = 0;
  private dqV!: Float64Array;
  private dqI!: Float64Array;
  private dqH = 0;
  private dqN = 0;
  private reqIdx = 0;
  private h = 1;
  private box!: Float64Array;
  private bp = 0;
  private sum = 0;
  private dl!: Float64Array;
  private dr!: Float64Array;
  private dp = 0;
  /** Lowest gain applied since the last reset (for tests and debug). */
  minGain = 1;

  constructor(o: LimiterOptions = {}) {
    const detector = o.detector ?? SIDE_CHAIN;
    this.c = linearOf(o.ceilingDb ?? LIMITER_CEILING_DB);
    this.L = o.lookahead ?? LIMITER_LOOKAHEAD;
    this.M = detector.M;
    this.phases = detector.phases;
    this.rel = 1 - Math.exp(-1 / (((o.releaseMs ?? LIMITER_RELEASE_MS) / 1000) * SAMPLE_RATE));
    this.latency = this.L + this.M;
    this.reset();
  }

  reset(): void {
    const N2 = 2 * this.M;
    this.histL = new Float64Array(N2);
    this.histR = new Float64Array(N2);
    this.hp = 0;
    this.dqV = new Float64Array(this.L + 2);
    this.dqI = new Float64Array(this.L + 2);
    this.dqH = 0;
    this.dqN = 0;
    this.reqIdx = 0;
    this.h = 1;
    this.box = new Float64Array(this.L + 1).fill(1);
    this.bp = 0;
    this.sum = this.L + 1;
    this.dl = new Float64Array(this.latency + 1);
    this.dr = new Float64Array(this.latency + 1);
    this.dp = 0;
    this.minGain = 1;
  }

  /** Pushes one raw sample pair; writes the delayed, gain-applied pair to out[0], out[1] and the gain to out[2]. */
  push(l: number, r: number, out: Float64Array): void {
    const M = this.M;
    const N2 = 2 * M;
    const hL = this.histL;
    const hR = this.histR;
    hL[this.hp] = l;
    hR[this.hp] = r;
    this.hp = (this.hp + 1) % N2;
    // Estimate around the sample M samples ago (between x[k] and x[k+1], k = newest − M).
    const k0 = this.hp; // oldest element in the ring
    let pk = Math.max(Math.abs(hL[(k0 + M - 1) % N2]!), Math.abs(hR[(k0 + M - 1) % N2]!));
    for (const w of this.phases) {
      let sl = 0;
      let sr = 0;
      for (let j = 0; j < N2; j++) {
        const a = (k0 + j) % N2;
        sl += w[j]! * hL[a]!;
        sr += w[j]! * hR[a]!;
      }
      const a = Math.max(Math.abs(sl), Math.abs(sr));
      if (a > pk) pk = a;
    }
    const req = pk > this.c ? this.c / pk : 1;
    // Sliding minimum over the last L+1 requests (a deque of increasing values).
    const cap = this.L + 2;
    const idx = this.reqIdx++;
    while (this.dqN > 0 && this.dqV[(this.dqH + this.dqN - 1) % cap]! >= req) this.dqN--;
    this.dqV[(this.dqH + this.dqN) % cap] = req;
    this.dqI[(this.dqH + this.dqN) % cap] = idx;
    this.dqN++;
    while (this.dqI[this.dqH]! <= idx - this.L - 1) {
      this.dqH = (this.dqH + 1) % cap;
      this.dqN--;
    }
    const gmin = this.dqV[this.dqH]!;
    const hr = this.h + (1 - this.h) * this.rel;
    this.h = gmin < hr ? gmin : hr;
    this.sum += this.h - this.box[this.bp]!;
    this.box[this.bp] = this.h;
    this.bp = (this.bp + 1) % (this.L + 1);
    const g = this.sum / (this.L + 1);
    this.dl[this.dp] = l;
    this.dr[this.dp] = r;
    this.dp = (this.dp + 1) % (this.latency + 1);
    out[0] = this.dl[this.dp]! * g;
    out[1] = this.dr[this.dp]! * g;
    out[2] = g;
    if (g < this.minGain) this.minGain = g;
  }
}
