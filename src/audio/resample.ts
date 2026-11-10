// MOD-Audio — resampling to 48 kHz (ADR-0008 §2: windowed-sinc polyphase, fixed taps). Pure, no DOM.
//
// Output sample k sits at input position x = k·M/L (M/L = rateIn/48000 reduced), split exactly with
// integers into i = ⌊k·M/L⌋ and the phase p = k·M mod L. It is the sum over the 2·⌈T⌉ input samples
// around x of x[n]·h(n − x), with h(d) = s·sinc(s·d)·kaiser(d/T): s = min(1, 48000/rateIn) (the cut-off
// follows the lower Nyquist), T = 32/s input samples (64 taps when upsampling), Kaiser β = 8.96 (≈ 90 dB
// stop band), each phase normalised to unity gain at DC. Every output sample depends only on the
// input samples by absolute index (summed in tap order in float64), so the result is bit-exact for any
// split of the input or output into blocks and for any decode start that has the support decoded.
// 48 kHz input is passed through unchanged.
// Implements: ADR-0008 §2 (resample to 48 kHz), INV-02 (same samples in preview and export), NFR-08.
import { SAMPLE_RATE } from '../plan';

/** Taps either side of the output position when upsampling (64 taps). */
export const RESAMPLE_HALF_TAPS = 32;
/** Kaiser window β (≈ 90 dB side lobes). */
export const RESAMPLE_KAISER_BETA = 8.96;
/** Phases tabulated up to this many (every common rate needs ≤ 640); beyond, computed per sample. */
const TABLE_LIMIT = 4096;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Modified Bessel function of the first kind, order 0 (series). */
function bessel0(x: number): number {
  let sum = 1;
  let term = 1;
  const q = (x * x) / 4;
  for (let k = 1; k < 64; k++) {
    term *= q / (k * k);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  return sum;
}

export class Resampler {
  /** Output k ↔ input k·M/L. */
  readonly M: number;
  readonly L: number;
  /** Input taps before the output position (the support is [i − before + 1, i + before]). */
  readonly before: number;
  private readonly taps: number;
  private readonly s: number;
  private readonly T: number;
  private readonly norm: number;
  private readonly table: (Float64Array | undefined)[] | null;
  private readonly bypass: boolean;
  // Input: samples [base, base + len) in bufL/bufR; below `base` and (after `end()`) past the end read 0.
  private bufL = new Float32Array(0);
  private bufR = new Float32Array(0);
  private off = 0;
  private len = 0;
  private base = Number.NaN;
  private ended = false;
  /** The next output sample. */
  next = 0;

  constructor(readonly rateIn: number) {
    const g = gcd(rateIn, SAMPLE_RATE);
    this.M = rateIn / g;
    this.L = SAMPLE_RATE / g;
    this.bypass = rateIn === SAMPLE_RATE;
    this.s = Math.min(1, SAMPLE_RATE / rateIn);
    this.T = RESAMPLE_HALF_TAPS / this.s;
    this.before = this.bypass ? 0 : Math.ceil(this.T);
    this.taps = 2 * this.before;
    this.norm = bessel0(RESAMPLE_KAISER_BETA);
    this.table = this.L <= TABLE_LIMIT ? new Array<Float64Array | undefined>(this.L) : null;
  }

  /** The input position (index and phase) of output sample k. */
  inputOf(k: number): number {
    return Math.floor((k * this.M) / this.L);
  }

  /** The first output sample whose whole support lies at or after input sample n. */
  firstOutputFrom(n: number): number {
    if (this.bypass) return n;
    return Math.ceil(((n + this.before - 1) * this.L) / this.M);
  }

  /** The coefficients of phase p (input taps i − before + 1 … i + before). */
  coefficients(p: number): Float64Array {
    const cached = this.table?.[p];
    if (cached) return cached;
    const c = new Float64Array(this.taps);
    const frac = p / this.L;
    const { s, T } = this;
    let sum = 0;
    for (let j = 0; j < this.taps; j++) {
      const d = j - (this.before - 1) - frac;
      const r = d / T;
      if (r <= -1 || r >= 1) continue;
      const w = bessel0(RESAMPLE_KAISER_BETA * Math.sqrt(1 - r * r)) / this.norm;
      const a = Math.PI * s * d;
      const h = a === 0 ? s : (s * Math.sin(a)) / a;
      c[j] = h * w;
      sum += c[j]!;
    }
    for (let j = 0; j < this.taps; j++) c[j] = c[j]! / sum;
    if (this.table) this.table[p] = c;
    return c;
  }

  /**
   * Adds input samples starting at input sample `at`. A gap after the input so far is filled with
   * silence; samples before the input's end are already there and are skipped.
   */
  push(at: number, L: Float32Array, R: Float32Array): void {
    if (Number.isNaN(this.base)) this.base = at;
    let from = 0;
    const endNow = this.base + this.len;
    if (at > endNow) this.append(null, null, 0, at - endNow);
    else from = endNow - at;
    if (from < L.length) this.append(L, R, from, L.length - from);
  }

  /** No more input: samples past it read as silence. */
  end(): void {
    this.ended = true;
  }

  /** The input end (exclusive), or NaN before any input. */
  get inputEnd(): number {
    return this.base + this.len;
  }

  private append(L: Float32Array | null, R: Float32Array | null, from: number, n: number): void {
    if (this.off + this.len + n > this.bufL.length) {
      const keep = this.len;
      const size = Math.max(keep + n, this.bufL.length * 2, 4096);
      const nl = new Float32Array(size);
      const nr = new Float32Array(size);
      nl.set(this.bufL.subarray(this.off, this.off + keep));
      nr.set(this.bufR.subarray(this.off, this.off + keep));
      this.bufL = nl;
      this.bufR = nr;
      this.off = 0;
    }
    const at = this.off + this.len;
    if (L && R) {
      this.bufL.set(L.subarray(from, from + n), at);
      this.bufR.set(R.subarray(from, from + n), at);
    } else {
      this.bufL.fill(0, at, at + n);
      this.bufR.fill(0, at, at + n);
    }
    this.len += n;
  }

  /** Output samples [next, …) as far as the input allows (all of it after `end()` up to `limit`). */
  produce(limit = Infinity): { from: number; L: Float32Array; R: Float32Array } | null {
    if (Number.isNaN(this.base)) return null;
    const inEnd = this.base + this.len;
    const from = this.next;
    // The last output whose support ends inside the input; once it has ended, the last that touches it.
    let last: number;
    if (this.ended) last = this.firstOutputFrom(inEnd) - 1;
    else last = this.bypass ? inEnd - 1 : Math.floor(((inEnd - 1 - this.before) * this.L) / this.M);
    last = Math.min(last, limit - 1);
    const n = last - from + 1;
    if (n <= 0) return null;
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    const bl = this.bufL;
    const br = this.bufR;
    const lo = this.base - this.off; // buffer index = sample − lo
    const hiIdx = this.off + this.len;
    if (this.bypass) {
      for (let q = 0; q < n; q++) {
        const b = from + q - lo;
        if (b >= this.off && b < hiIdx) {
          L[q] = bl[b]!;
          R[q] = br[b]!;
        }
      }
    } else {
      const { M, taps, before } = this;
      const Lp = this.L;
      let i = Math.floor((from * M) / Lp);
      let p = from * M - i * Lp;
      for (let q = 0; q < n; q++) {
        const c = this.coefficients(p);
        const b0 = i - before + 1 - lo;
        let sl = 0;
        let sr = 0;
        if (b0 >= this.off && b0 + taps <= hiIdx) {
          for (let j = 0; j < taps; j++) {
            sl += c[j]! * bl[b0 + j]!;
            sr += c[j]! * br[b0 + j]!;
          }
        } else {
          for (let j = 0; j < taps; j++) {
            const b = b0 + j;
            if (b < this.off || b >= hiIdx) continue;
            sl += c[j]! * bl[b]!;
            sr += c[j]! * br[b]!;
          }
        }
        L[q] = sl;
        R[q] = sr;
        p += M;
        while (p >= Lp) {
          p -= Lp;
          i++;
        }
      }
    }
    this.next = from + n;
    // Drop input no later output needs.
    const need = this.inputOf(this.next) - this.before + 1;
    const drop = Math.min(this.len, Math.max(0, need - this.base));
    if (drop > 0) {
      this.off += drop;
      this.len -= drop;
      this.base += drop;
    }
    return { from, L, R };
  }
}
