// MOD-Audio — 4× interpolation filters and the true-peak meter (ADR-0008 §3 and its outcome).
// Promoted from spike/audio (spikes/audio/public/dsp.js, SP-audio). Pure, no DOM.
// Implements: RULE-12 "true peak" measurement (the limiter's side-chain and the compliance meter).

/** Three fractional phases (1/4, 2/4, 3/4) of a 4× interpolator, each `taps` long. */
export interface Interpolator {
  /** Half the taps per phase: the value between x[k] and x[k+1] reads x[k−M+1 .. k+M]. */
  readonly M: number;
  readonly phases: readonly Float64Array[];
  /** The phases are the BS.1770-4 Annex 2 polyphase table (12 taps, applied on x[k−5 .. k+6]). */
  readonly bs1770: boolean;
}

function besselI0(x: number): number {
  let s = 1;
  let t = 1;
  for (let k = 1; k < 40; k++) {
    t *= (x / (2 * k)) ** 2;
    s += t;
  }
  return s;
}

/** A Kaiser-windowed sinc 4× interpolator with 2M taps per phase, each phase normalised to unit DC gain. */
export function designInterpolator(M: number, beta: number): Interpolator {
  const phases: Float64Array[] = [];
  for (const f of [0.25, 0.5, 0.75]) {
    const w = new Float64Array(2 * M);
    let sum = 0;
    for (let j = 0; j < 2 * M; j++) {
      const x = j - M + 1 - f;
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const r = x / M;
      const win = Math.abs(r) >= 1 ? 0 : besselI0(beta * Math.sqrt(1 - r * r)) / besselI0(beta);
      w[j] = sinc * win;
      sum += sinc * win;
    }
    for (let j = 0; j < 2 * M; j++) w[j] = w[j]! / sum;
    phases.push(w);
  }
  return { M, phases, bs1770: false };
}

/** ITU-R BS.1770-4 Annex 2 example 4× interpolator (48 taps, 12 per phase), the three non-trivial phases. */
export const BS1770_METER: Interpolator = {
  M: 6,
  bs1770: true,
  phases: [
    [
      -0.0291748046875, 0.029296875, -0.0517578125, 0.089111328125, -0.16650390625, 0.465087890625, 0.77978515625,
      -0.2003173828125, 0.1015625, -0.0582275390625, 0.0330810546875, -0.0189208984375,
    ],
    [
      -0.0189208984375, 0.0330810546875, -0.0582275390625, 0.1015625, -0.2003173828125, 0.77978515625, 0.465087890625,
      -0.16650390625, 0.089111328125, -0.0517578125, 0.029296875, -0.0291748046875,
    ],
    [
      -0.00830078125, 0.014892578125, -0.026611328125, 0.047607421875, -0.102294921875, 0.97216796875, 0.1373291015625,
      -0.0594482421875, 0.033203125, -0.0196533203125, 0.010986328125, 0.001708984375,
    ],
  ].map((p) => Float64Array.from(p)),
};

/** The limiter's side-chain: 32 taps per phase (SP-audio: 16 taps under-read by 1.2 dB near Nyquist). */
export const SIDE_CHAIN: Interpolator = designInterpolator(16, 8);

export const dbOf = (linear: number): number => 20 * Math.log10(linear || 1e-12);
export const linearOf = (db: number): number => 10 ** (db / 20);

/**
 * True peak (linear and dBTP) of planar channels with a 4× interpolator (default: the BS.1770-4
 * Annex 2 meter used for compliance, F-011.AC5 and RULE-12).
 */
export function truePeak(
  channels: readonly Float32Array[],
  meter: Interpolator = BS1770_METER,
): { peak: number; dB: number; at: number } {
  let peak = 0;
  let at = -1;
  const M = meter.M;
  for (const x of channels) {
    const n = x.length;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(x[i]!);
      if (a > peak) {
        peak = a;
        at = i;
      }
    }
    const first = meter.bs1770 ? -5 : -M + 1;
    const taps = meter.bs1770 ? 12 : 2 * M;
    for (let k = 0; k < n - 1; k++) {
      for (const w of meter.phases) {
        let s = 0;
        for (let j = 0; j < taps; j++) {
          const idx = k + first + j;
          if (idx >= 0 && idx < n) s += w[j]! * x[idx]!;
        }
        const a = Math.abs(s);
        if (a > peak) {
          peak = a;
          at = k;
        }
      }
    }
  }
  return { peak, dB: dbOf(peak), at };
}

/**
 * The same true-peak measure over a stream of blocks (the verify-and-trim pass decodes a whole export
 * without holding it): `push` planar blocks in order, then `finish`. Equal to `truePeak` over the
 * concatenation. Implements: ADR-0008 outcome item 2 (measure the decoded file), RULE-12.
 */
export class TruePeakMeter {
  private hist: Float32Array[] = [];
  /** Global index of hist[c][0]. */
  private base = 0;
  private total = 0;
  private nextK = 0;
  private peakValue = 0;
  private readonly first: number;
  private readonly taps: number;

  constructor(private readonly meter: Interpolator = BS1770_METER) {
    this.first = meter.bs1770 ? -5 : -meter.M + 1;
    this.taps = meter.bs1770 ? 12 : 2 * meter.M;
  }

  push(channels: readonly Float32Array[]): void {
    const n = channels[0]?.length ?? 0;
    channels.forEach((x, c) => {
      for (let i = 0; i < x.length; i++) {
        const a = Math.abs(x[i]!);
        if (a > this.peakValue) this.peakValue = a;
      }
      const old = this.hist[c] ?? new Float32Array(0);
      const next = new Float32Array(old.length + x.length);
      next.set(old);
      next.set(x, old.length);
      this.hist[c] = next;
    });
    this.total += n;
    this.run(this.total - (this.first + this.taps - 1));
    const keep = this.nextK + this.first - this.base;
    if (keep > 0) {
      this.hist = this.hist.map((h) => h.slice(Math.min(keep, h.length)));
      this.base += keep;
    }
  }

  /** Interpolated values for k < limit (and k < total − 1), reading only stored samples. */
  private run(limit: number): void {
    const end = Math.min(limit, this.total - 1);
    for (; this.nextK < end; this.nextK++) {
      const k = this.nextK;
      for (const h of this.hist) {
        for (const w of this.meter.phases) {
          let s = 0;
          for (let j = 0; j < this.taps; j++) {
            const idx = k + this.first + j;
            if (idx >= 0 && idx < this.total) s += w[j]! * h[idx - this.base]!;
          }
          const a = Math.abs(s);
          if (a > this.peakValue) this.peakValue = a;
        }
      }
    }
  }

  /** Completes the measure (the last samples, zero beyond the end) and returns it. */
  finish(): { peak: number; dB: number } {
    this.run(Infinity);
    return { peak: this.peakValue, dB: dbOf(this.peakValue) };
  }
}
