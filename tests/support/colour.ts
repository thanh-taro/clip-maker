// Test support: sRGB (D65) → CIELAB and CIEDE2000 (the RULE-08 / NFR-08 measures), and the RULE-08
// grey-ramp bars, promoted from SP-gpu-color's colour.js / grade.js (test code only).
const toLin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export type Lab = readonly [number, number, number];
export type Rgb = readonly [number, number, number];

export function lab([r, g, b]: Rgb): Lab {
  const R = toLin(r);
  const G = toLin(g);
  const B = toLin(b);
  const X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const Y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const Z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f(X);
  const fy = f(Y);
  const fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function de00(l1: Lab, l2: Lab): number {
  const [L1, a1, b1] = l1;
  const [L2, a2, b2] = l2;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const h = (b: number, a: number): number => {
    if (a === 0 && b === 0) return 0;
    const x = Math.atan2(b, a) / rad;
    return x < 0 ? x + 360 : x;
  };
  const h1p = h(b1, a1p);
  const h2p = h(b2, a2p);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp = h1p + h2p < 360 ? hbp + 360 : hbp - 360;
    hbp /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hbp - 30) * rad) +
    0.24 * Math.cos(2 * hbp * rad) +
    0.32 * Math.cos((3 * hbp + 6) * rad) -
    0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

export const deRgb = (a: Rgb, b: Rgb): number => de00(lab(a), lab(b));

/** The 256-step 8-bit grey ramp of RULE-08, as [0, 1] values. */
export const GREY_RAMP: readonly Rgb[] = Array.from({ length: 256 }, (_, i) => [i / 255, i / 255, i / 255] as const);

/** The largest ΔE00 between adjacent steps of the untouched ramp (the "at default" step). */
export const DEFAULT_MAX_STEP = (() => {
  let m = 0;
  for (let i = 1; i < 256; i++) m = Math.max(m, deRgb(GREY_RAMP[i - 1]!, GREY_RAMP[i]!));
  return m;
})();

export interface RampBars {
  readonly reversals: number;
  readonly merged: number;
  readonly maxStep: number;
  readonly pass: boolean;
}

/**
 * RULE-08 full-precision bars on a ramp output: never reverses order (CIE L*), steps that don't clip
 * stay distinct, no adjacent step more than twice the largest step at default.
 */
export function rampBars(out: readonly Rgb[]): RampBars {
  const L = out.map(lab);
  const clipped = (c: Rgb): boolean => c.some((x) => x <= 0 || x >= 1);
  let reversals = 0;
  let merged = 0;
  let maxStep = 0;
  for (let i = 1; i < out.length; i++) {
    if (L[i]![0] - L[i - 1]![0] < -1e-9) reversals++;
    const d = de00(L[i - 1]!, L[i]!);
    if (!clipped(out[i]!) && !clipped(out[i - 1]!) && d < 1e-6) merged++;
    maxStep = Math.max(maxStep, d);
  }
  return { reversals, merged, maxStep, pass: reversals === 0 && merged === 0 && maxStep <= 2 * DEFAULT_MAX_STEP };
}
