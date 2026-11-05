// MOD-Audio — our own pitch-preserving time-stretch: WSOLA with fixed sync points (ADR-0008 §4 and
// outcome rule 4). Promoted from spike/timestretch (spikes/timestretch/src/dsp/stretch.ts, SP-timestretch).
// Implements: RULE-06 / F-005.R3 (sound at the clip's speed with its original pitch), INV-02 (the same
// samples from any seek, in preview and export, in every engine).
//
// Frame j is centred on output sample j·H and covers output [jH − H, jH + H) (periodic Hann, W = 2H,
// which overlap-adds to exactly 1 at hop H). It reads source [a_j − H, a_j + H) with
// a_j = round(j·H·speed) + δ_j. δ_j maximises the normalised correlation between the source under
// frame j−1's second half and frame j's first half (coarse search on L+R decimated ×4, then ±4 samples
// at full rate). Every 50th frame (1 s of output) is a sync frame pinned at δ = 0, so any output range
// depends only on the source, the speed and the frames since the previous sync frame: rendering is
// bit-exact whatever the block sizes and seek history. Each output sample sums its frames in ascending
// order. No cross-fade at sync frames. 1× bypasses the stretch.
import { SAMPLE_RATE } from '../plan';
import type { SoundSource } from './source';

/** 40 ms Hann window. */
export const WSOLA_WINDOW = Math.round(0.04 * SAMPLE_RATE);
/** Output hop: 20 ms. */
export const WSOLA_HOP = WSOLA_WINDOW / 2;
/** Search ± 12 ms. */
export const WSOLA_TOLERANCE = Math.round(0.012 * SAMPLE_RATE);
/** Coarse search decimation. */
export const WSOLA_DECIMATION = 4;
/** A sync frame every 1 s of output (50 frames). */
export const WSOLA_SYNC_FRAMES = SAMPLE_RATE / WSOLA_HOP;

/** Renders a voice's sound at its speed: output sample n plays around source sample origin + n·speed. */
export interface Stretcher {
  readonly speed: number;
  /** Fills outL/outR with output samples [outFrom, outFrom + outL.length) (outFrom ≥ 0). */
  render(outFrom: number, outL: Float32Array, outR: Float32Array): void;
}

/** A stretcher over `source` starting at source sample `origin` (the voice's in point). */
export function createStretcher(source: SoundSource, origin: number, speed: number): Stretcher {
  return speed === 1 ? new Copy(source, origin) : new Wsola(source, origin, speed);
}

/**
 * ADR-0008 outcome rule 5: after a seek to output sample `outSample`, decoding starts at the previous
 * sync point's source position minus 32 ms (window half + search), relative to the voice's origin.
 */
export function seekDecodeFrom(speed: number, outSample: number): number {
  if (speed === 1) return outSample;
  const sync = Math.floor(Math.max(0, outSample) / WSOLA_HOP / WSOLA_SYNC_FRAMES) * WSOLA_SYNC_FRAMES;
  return Math.round(sync * WSOLA_HOP * speed) - WSOLA_HOP - WSOLA_TOLERANCE;
}

class Copy implements Stretcher {
  readonly speed = 1;
  constructor(
    private readonly source: SoundSource,
    private readonly origin: number,
  ) {}
  render(outFrom: number, outL: Float32Array, outR: Float32Array): void {
    this.source.read(this.origin + outFrom, outL, outR);
  }
}

/** Periodic Hann: overlap-adds to a constant at hop n/2. */
function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

const NONE = 0x7fffffff;

export class Wsola implements Stretcher {
  /** Frames computed and seeks taken (instrumentation). */
  readonly stats = { frames: 0, seeks: 0 };
  private readonly H = WSOLA_HOP;
  private readonly W = WSOLA_WINDOW;
  private readonly T = WSOLA_TOLERANCE;
  private readonly D = WSOLA_DECIMATION;
  private readonly win = hann(WSOLA_WINDOW);
  // Small cache of analysis positions; lastJ/lastA continue the chain without a seek.
  private readonly ringJ = new Int32Array(16).fill(NONE);
  private readonly ringA = new Float64Array(16);
  private lastJ = -1;
  private lastA = 0;
  // Scratch.
  private readonly fL = new Float32Array(WSOLA_WINDOW);
  private readonly fR = new Float32Array(WSOLA_WINDOW);
  private rL = new Float32Array(0);
  private rR = new Float32Array(0);
  private mono = new Float32Array(0);
  private dmono = new Float32Array(0);

  constructor(
    private readonly source: SoundSource,
    private readonly origin: number,
    readonly speed: number,
  ) {}

  private nominal(j: number): number {
    return Math.round(j * this.H * this.speed);
  }

  /** Analysis centre of frame j (j ≥ 0), relative to the origin. */
  private aOf(j: number): number {
    const slot = j & 15;
    if (this.ringJ[slot] === j) return this.ringA[slot]!;
    const sj = Math.floor(j / WSOLA_SYNC_FRAMES) * WSOLA_SYNC_FRAMES;
    let k: number;
    let a: number;
    if (this.lastJ >= 0 && this.lastJ < j && this.lastJ >= sj) {
      k = this.lastJ;
      a = this.lastA;
    } else {
      this.stats.seeks++;
      k = sj;
      a = this.nominal(sj);
      this.ringJ[k & 15] = k;
      this.ringA[k & 15] = a;
    }
    while (k < j) {
      k++;
      a = k % WSOLA_SYNC_FRAMES === 0 ? this.nominal(k) : this.search(a, this.nominal(k));
      this.ringJ[k & 15] = k;
      this.ringA[k & 15] = a;
      this.stats.frames++;
    }
    this.lastJ = k;
    this.lastA = a;
    return a;
  }

  /**
   * Reads source [from, to) (relative to the origin; `from` and `to` multiples of D) as the L+R sum
   * (float32) and its D-sample sums (float32), the same values whatever range is read.
   */
  private loadMono(from: number, to: number): void {
    const n = to - from;
    if (this.rL.length < n) {
      this.rL = new Float32Array(n);
      this.rR = new Float32Array(n);
      this.mono = new Float32Array(n);
      this.dmono = new Float32Array(n / this.D + 1);
    }
    const L = this.rL.subarray(0, n);
    const R = this.rR.subarray(0, n);
    this.source.read(this.origin + from, L, R);
    const m = this.mono;
    for (let i = 0; i < n; i++) m[i] = L[i]! + R[i]!;
    const D = this.D;
    const dm = this.dmono;
    for (let g = 0; g < n / D; g++) {
      let s = 0;
      for (let d = 0; d < D; d++) s += m[g * D + d]!;
      dm[g] = s;
    }
  }

  /** a_j for the candidate whose first half best continues the source x[aPrev .. aPrev + H). */
  private search(aPrev: number, nom: number): number {
    const { H, T, D } = this;
    const Ld = H / D;
    // Coarse, on the decimated grid (grid point g covers source [gD, gD + D)).
    const td = Math.floor(aPrev / D);
    const resid = aPrev - td * D;
    const lo = nom - H - T;
    const hi = nom - H + T;
    const sdLo = Math.ceil((lo - resid) / D);
    const sdHi = Math.floor((hi - resid) / D);
    const gFrom = Math.min(td, sdLo, Math.floor(Math.min(aPrev, lo - D) / D));
    const gTo = Math.max(td + Ld, sdHi + Ld + 1, Math.ceil((Math.max(aPrev, hi + D) + H) / D));
    const base = gFrom * D;
    this.loadMono(base, gTo * D);
    const dm = this.dmono;
    const m = this.mono;
    const td0 = td - gFrom;
    let energy = 0;
    for (let i = 0; i < Ld; i++) {
      const v = dm[sdLo - gFrom + i]!;
      energy += v * v;
    }
    let best = -Infinity;
    let bestSd = sdLo;
    for (let sd = sdLo; sd <= sdHi; sd++) {
      const s0 = sd - gFrom;
      let dot = 0;
      for (let i = 0; i < Ld; i++) dot += dm[td0 + i]! * dm[s0 + i]!;
      const score = dot / Math.sqrt(energy + 1e-9);
      if (score > best) {
        best = score;
        bestSd = sd;
      }
      const out = dm[s0]!;
      const inn = dm[s0 + Ld]!;
      energy += inn * inn - out * out;
    }
    // Fine, at full rate around the coarse winner.
    const c0 = bestSd * D + resid;
    const fLo = Math.max(lo, c0 - D);
    const fHi = Math.min(hi, c0 + D);
    const t0 = aPrev - base;
    let fBest = -Infinity;
    let fStart = c0;
    for (let s = fLo; s <= fHi; s++) {
      const s0 = s - base;
      let dot = 0;
      let e = 0;
      for (let i = 0; i < H; i++) {
        const v = m[s0 + i]!;
        dot += m[t0 + i]! * v;
        e += v * v;
      }
      const score = dot / Math.sqrt(e + 1e-9);
      if (score > fBest) {
        fBest = score;
        fStart = s;
      }
    }
    return fStart + H;
  }

  render(outFrom: number, outL: Float32Array, outR: Float32Array): void {
    const n = outL.length;
    const { H, W, win, fL, fR } = this;
    outL.fill(0);
    outR.fill(0);
    if (n === 0) return;
    const jmin = Math.max(0, Math.floor(outFrom / H));
    const jmax = Math.floor((outFrom + n - 1) / H) + 1;
    for (let j = jmin; j <= jmax; j++) {
      const a = this.aOf(j);
      const oStart = j * H - H;
      const m0 = Math.max(0, outFrom - oStart);
      const m1 = Math.min(W, outFrom + n - oStart);
      if (m1 <= m0) continue;
      this.source.read(this.origin + a - H, fL, fR);
      for (let mm = m0; mm < m1; mm++) {
        const idx = oStart + mm - outFrom;
        const g = win[mm]!;
        outL[idx] = outL[idx]! + g * fL[mm]!;
        outR[idx] = outR[idx]! + g * fR[mm]!;
      }
    }
  }
}
