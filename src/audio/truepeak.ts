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
