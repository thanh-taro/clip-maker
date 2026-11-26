// MOD-Core — the colour tools' pure maths (RULE-24, D-053; ADR-0017 §2–§5): the working perceptual space
// (OKLab / OKLCh), the hue wheel, the colour ranges and their weights, the grey gate, gamut reduction at
// constant lightness and hue, the per-clip hue table of the colour mixer and colour pop, split toning's tone
// weights and duotone's gradient position. Shared by the CPU reference (the test oracle) and MOD-Compositor,
// which mirrors it in GLSL, so the oracle and the GPU agree by construction (ADR-0017 §3).
// Colour replace (RULE-25, F-028, 1.3.0): match weights, the one turning direction and the shares of several
// replacements (ADR-0017 §5 and its 2026-11-26 Amendment). The grey gate is on CIELAB C* (SP-colour-tools finding,
// see `greyGate`).
// Implements: RULE-24 *Measures*, *Hue wheel*, *Colour ranges*, *Colour mixer*, *Colour pop*, *Split toning*,
// *Duotone*; RULE-25 *Matching*, *Change*, *Several replacements*, *Grey and faint From colours*; ADR-0017 §2–§5.

export type Vec3 = readonly [number, number, number];

/** sRGB transfer (encoded ↔ linear), on [0, 1]. */
export const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linearToSrgb = (l: number): number => (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);

/** Smoothstep (GLSL semantics): 0 at `e0`, 1 at `e1`, steepest slope 1.5 ÷ (e1 − e0) (ADR-0017 §5). */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Linear sRGB → OKLab (Ottosson's matrices). L in [0, 1] for in-gamut colours. */
export function linearToOklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → linear sRGB (may fall outside [0, 1] for out-of-gamut colours). */
export function oklabToLinear([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export const srgbToOklab = (c: Vec3): Vec3 =>
  linearToOklab([srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])]);

/** OKLab → OKLCh: [L, C, h in degrees 0 ≤ h < 360]. */
export function okLch([L, a, b]: Vec3): Vec3 {
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return [L, Math.hypot(a, b), h < 0 ? h + 360 : h];
}

/** OKLCh (h in degrees) → OKLab. */
export function fromLch(L: number, C: number, h: number): Vec3 {
  const r = (h * Math.PI) / 180;
  return [L, C * Math.cos(r), C * Math.sin(r)];
}

/** Gamut test on linear values, with the same tolerance as the shader (float32). */
const EPS = 1e-4;
const inGamut = (l: Vec3): boolean => l.every((x) => x >= -EPS && x <= 1 + EPS);

/** ADR-0017 §2: binary-search steps of the chroma reduction. */
export const GAMUT_STEPS = 8;

/**
 * Implements: ADR-0017 §2 — out-of-gamut colours are brought in by reducing chroma at constant L and h
 * (binary search, 8 steps), never by per-channel clamping, so hue and lightness are kept.
 */
export function gamutLab(lab: Vec3): Vec3 {
  if (inGamut(oklabToLinear(lab))) return lab;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < GAMUT_STEPS; i++) {
    const m = 0.5 * (lo + hi);
    if (inGamut(oklabToLinear([lab[0], lab[1] * m, lab[2] * m]))) lo = m;
    else hi = m;
  }
  return [lab[0], lab[1] * lo, lab[2] * lo];
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** OKLab → sRGB-encoded values in [0, 1], through the gamut reduction. */
export function oklabToSrgb(lab: Vec3): Vec3 {
  const l = oklabToLinear(gamutLab(lab));
  return [linearToSrgb(clamp01(l[0])), linearToSrgb(clamp01(l[1])), linearToSrgb(clamp01(l[2]))];
}

/** "#RRGGBB" → sRGB values in [0, 1]. */
export function hexRgb(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * Implements: RULE-24 *Hue wheel* — the sRGB colour of hue `deg` at full saturation and half lightness
 * (HSL; 0° red, 120° green, 240° blue).
 */
export function hueWheelRgb(deg: number): Vec3 {
  const f = (n: number): number => {
    const k = (n + deg / 30) % 12;
    return 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

/** RULE-24: the working-space (OKLCh) hue, in degrees, of the hue wheel's colour at `deg`. */
export const wheelOkHue = (deg: number): number => okLch(srgbToOklab(hueWheelRgb(deg)))[2];

/** RULE-24 colour ranges in hue order (the schema's `colourRange`). */
export const COLOUR_RANGES = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const;
export type ColourRangeName = (typeof COLOUR_RANGES)[number];

/** RULE-24: each range's sRGB reference colour. */
export const RANGE_REFERENCE: Readonly<Record<ColourRangeName, string>> = Object.freeze({
  red: '#FF0000',
  orange: '#FF8000',
  yellow: '#FFFF00',
  green: '#00FF00',
  aqua: '#00FFFF',
  blue: '#0000FF',
  purple: '#8000FF',
  magenta: '#FF00FF',
});

/** RULE-24: each range's centre on the hue wheel (degrees), used to name a hue slider's value. */
export const RANGE_WHEEL: Readonly<Record<ColourRangeName, number>> = Object.freeze({
  red: 0,
  orange: 30,
  yellow: 60,
  green: 120,
  aqua: 180,
  blue: 240,
  purple: 270,
  magenta: 300,
});

/** RULE-24 / ADR-0017 §3: the range centres, the OKLCh hues of the reference colours, in range order. */
export const RANGE_CENTRES: readonly number[] = /* @__PURE__ */ Object.freeze(
  COLOUR_RANGES.map((r) => okLch(srgbToOklab(hexRgb(RANGE_REFERENCE[r])))[2]),
);

const wrap360 = (h: number): number => ((h % 360) + 360) % 360;
/** Hue distance going up from `from` to `to`, in [0, 360). */
const upFrom = (from: number, to: number): number => wrap360(to - from);

/** Hue distance from range `i`'s centre to the next range's centre (Magenta → Red wraps). */
export const gapAfter = (i: number): number => upFrom(RANGE_CENTRES[i]!, RANGE_CENTRES[(i + 1) % 8]!);
/** Hue distance from the previous range's centre to range `i`'s. */
export const gapBefore = (i: number): number => gapAfter((i + 7) % 8);

/**
 * Implements: RULE-24 *Colour ranges* — a hue belongs to the two ranges whose centres surround it, with
 * weights that change smoothly with hue (a smoothstep between the centres and its complement) and add up
 * to 1. Returns [lower range index, its weight, upper range index, its weight].
 */
export function rangeWeights(h: number): readonly [number, number, number, number] {
  const hh = wrap360(h);
  for (let i = 0; i < 8; i++) {
    const d = upFrom(RANGE_CENTRES[i]!, hh);
    const gap = gapAfter(i);
    if (d < gap) {
      const s = smoothstep(0, 1, d / gap);
      return [i, 1 - s, (i + 1) % 8, s];
    }
  }
  return [0, 1, 1, 0]; // unreachable: the gaps cover the circle
}

/** One range's weight at hue `h` (0 outside the two gaps around its centre). */
export function rangeWeight(range: number, h: number): number {
  const [i, wi, j, wj] = rangeWeights(h);
  return (i === range ? wi : 0) + (j === range ? wj : 0);
}

/** CIELAB C* (D65) of linear sRGB values — the measure RULE-24's grey test and grey fade are stated in. */
export function cieChroma([r, g, b]: Vec3): number {
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const fy = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b);
  const fz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return Math.hypot(500 * (fx - fy), 200 * (fy - fz));
}

/**
 * Implements: RULE-24 *Colour ranges* — a range's effect fades smoothly to none as the pixel's C* falls from 12
 * to 2 (a smoothstep on CIELAB C*). SP-colour-tools found ADR-0017 §2's OK-chroma stand-in (0.0065…0.029)
 * wrong below L* 10, where CIELAB is linear and OK C is not: #050003 has C* 1.85 but OK C 0.034 (full
 * weight), so dark sensor noise would take mixer and pop changes. The gate is therefore computed on C*.
 */
export const GREY_GATE: readonly [number, number] = [2, 12];
export const greyGate = (linear: Vec3): number => smoothstep(GREY_GATE[0], GREY_GATE[1], cieChroma(linear));

// ── colour mixer and colour pop: the per-clip hue table (ADR-0017 §3) ─────────────────────────────

/** ADR-0017 §3: entries of the hue table (over one turn of OKLCh hue). */
export const HUE_TABLE_SIZE = 1024;

export interface MixerValues {
  readonly hue?: number;
  readonly saturation?: number;
  readonly lightness?: number;
}

/** Colour pop as the table needs it: the kept range (index), Range and Amount (0–100). */
export interface PopValues {
  readonly range: number;
  readonly spread: number;
  readonly amount: number;
}

/** The mixer's per-hue effect: hue shift (degrees), chroma factor, lightness move in [−1, 1]. */
export function mixerAt(mixer: readonly (MixerValues | undefined)[], h: number): Vec3 {
  const [i, wi, j, wj] = rangeWeights(h);
  let shift = 0;
  let factor = 0;
  let move = 0;
  for (const [k, w] of [
    [i, wi],
    [j, wj],
  ] as const) {
    const v = mixer[k];
    const hue = (v?.hue ?? 0) / 100;
    // RULE-24: Hue +100 moves to the next range's centre hue, −100 to the previous one's, in proportion.
    shift += w * hue * (hue > 0 ? gapAfter(k) : gapBefore(k));
    // Saturation −100 grey, +100 double chroma.
    factor += w * (1 + (v?.saturation ?? 0) / 100);
    move += (w * (v?.lightness ?? 0)) / 100;
  }
  return [shift, factor, move];
}

/**
 * Implements: RULE-24 *Colour pop* — the keep weight at hue `h`: 1 within Range (25 % of the way to each
 * neighbouring centre at 0, 100 % at 100), fading to 0 over a further 25 % of the way (a smoothstep).
 */
export function popKeep(pop: PopValues, h: number): number {
  const c = RANGE_CENTRES[pop.range]!;
  let delta = wrap360(h - c);
  if (delta > 180) delta -= 360;
  const gap = delta >= 0 ? gapAfter(pop.range) : gapBefore(pop.range);
  const f = 0.25 + (0.75 * pop.spread) / 100;
  return 1 - smoothstep(f * gap, (f + 0.25) * gap, Math.abs(delta));
}

/**
 * Implements: ADR-0017 §3 — the hue table: entry j (hue j × 360 ÷ 1024°) holds the mixer's hue shift in
 * turns, its chroma factor, its lightness move, and colour pop's chroma loss (Amount × (1 − keep)).
 */
export function hueTable(mixer: readonly (MixerValues | undefined)[], pop: PopValues | null): Float32Array {
  const t = new Float32Array(HUE_TABLE_SIZE * 4);
  for (let e = 0; e < HUE_TABLE_SIZE; e++) {
    const h = (e * 360) / HUE_TABLE_SIZE;
    const [shift, factor, move] = mixerAt(mixer, h);
    t[e * 4] = shift / 360;
    t[e * 4 + 1] = factor;
    t[e * 4 + 2] = move;
    t[e * 4 + 3] = pop ? (pop.amount / 100) * (1 - popKeep(pop, h)) : 0;
  }
  return t;
}

/** The table read as the GPU reads it: linear filtering between entries, wrapping around (`REPEAT`). */
export function sampleHueTable(table: Float32Array, h: number): readonly [number, number, number, number] {
  const u = (wrap360(h) / 360) * HUE_TABLE_SIZE;
  const j0 = Math.floor(u) % HUE_TABLE_SIZE;
  const j1 = (j0 + 1) % HUE_TABLE_SIZE;
  const f = u - Math.floor(u);
  const at = (k: number): number => table[j0 * 4 + k]! + (table[j1 * 4 + k]! - table[j0 * 4 + k]!) * f;
  return [at(0), at(1), at(2), at(3)];
}

/**
 * Implements: RULE-24 *Colour mixer* then *Colour pop* on one OKLab colour (the CPU reference of the shader's
 * `mixPop`): mixer values by the pixel's range weights times the grey gate, the result brought into gamut at
 * constant L and h; then colour pop's loss read at the mixed hue, times the grey gate of the mixed chroma.
 */
export function mixPopLab(lab: Vec3, table: Float32Array, mixOn: boolean, popOn: boolean): Vec3 {
  const g0 = greyGate(oklabToLinear(lab));
  // A grey pixel (gate 0) is left exactly as it is, as in the shader, which so never takes atan(0, 0).
  if (g0 <= 0) return lab;
  let [L, C, h] = okLch(lab);
  if (mixOn) {
    const g = g0;
    const [shift, factor, move] = sampleHueTable(table, h);
    h += g * shift * 360;
    C *= 1 + g * (factor - 1);
    const mv = g * move;
    L += mv > 0 ? (1 - L) * 0.5 * mv : L * 0.5 * mv;
    [L, C, h] = okLch(gamutLab(fromLch(L, C, h)));
  }
  if (popOn) C *= 1 - (mixOn ? greyGate(oklabToLinear(fromLch(L, C, h))) : g0) * sampleHueTable(table, h)[3];
  return fromLch(L, C, h);
}

// ── split toning and duotone (ADR-0017 §4) ───────────────────────────────────────────────────────

/** ADR-0017 §4: OK chroma of a tint at strength 100 (about C* 20). */
export const SPLIT_CHROMA = 0.05;
/** RULE-24: half-width of the crossover fade and width of the black / white fades, in L (0–1). */
export const SPLIT_HALF = 0.15;
export const SPLIT_EDGE = 0.2;

/** RULE-24: the crossover lightness (0–1) for Balance −100…+100: 0.80 → 0.50 → 0.20. */
export const splitCrossover = (balance: number): number => 0.5 - (0.3 * balance) / 100;

/**
 * Implements: RULE-24 *Split toning* tone weights at lightness L (0–1): [shadows, highlights], each full
 * 0.15 inside its side of the crossover and none 0.15 past it, both faded to none within 0.20 of 0 and 1.
 */
export function splitWeights(L: number, crossover: number): readonly [number, number] {
  const w = smoothstep(crossover - SPLIT_HALF, crossover + SPLIT_HALF, L);
  const edge = smoothstep(0, SPLIT_EDGE, L) * (1 - smoothstep(1 - SPLIT_EDGE, 1, L));
  return [edge * (1 - w), edge * w];
}

/** A tint's OKLab (a, b) at strength 100 for a hue-wheel hue (ADR-0017 §4). */
export function tintVector(wheelDeg: number): readonly [number, number] {
  const h = (wheelOkHue(wheelDeg) * Math.PI) / 180;
  return [SPLIT_CHROMA * Math.cos(h), SPLIT_CHROMA * Math.sin(h)];
}

/** Implements: RULE-24 split toning on one OKLab colour: the tints added by tone weight, L kept, then gamut. */
export function splitLab(
  lab: Vec3,
  shadows: readonly [number, number],
  highlights: readonly [number, number],
  crossover: number,
): Vec3 {
  const [ws, wh] = splitWeights(lab[0], crossover);
  return gamutLab([
    lab[0],
    lab[1] + ws * shadows[0] + wh * highlights[0],
    lab[2] + ws * shadows[1] + wh * highlights[1],
  ]);
}

/** Rec. 709 / sRGB luminance weights. */
const KY: Vec3 = [0.2126, 0.7152, 0.0722];

/**
 * Implements: RULE-24 *Duotone* gradient position (ADR-0017 §4): CIELAB L* ÷ 100 from the relative
 * luminance of the linear values, so the gradient is crossed in even steps of perceived lightness.
 */
export function duotonePosition(linear: Vec3): number {
  const Y = KY[0] * linear[0] + KY[1] * linear[1] + KY[2] * linear[2];
  const Ls = Y > 216 / 24389 ? 116 * Math.cbrt(Y) - 16 : (24389 / 27) * Y;
  return clamp01(Ls / 100);
}

/** RULE-24: the duotone gradient's colour at position t, blended in OKLab, brought into gamut. */
export const duotoneLab = (shadows: Vec3, highlights: Vec3, t: number): Vec3 =>
  gamutLab([
    shadows[0] + (highlights[0] - shadows[0]) * t,
    shadows[1] + (highlights[1] - shadows[1]) * t,
    shadows[2] + (highlights[2] - shadows[2]) * t,
  ]);

/**
 * Implements: RULE-24 *Hue wheel* naming — the range a hue slider's value names: the nearest centre on the
 * hue wheel, and a hue exactly halfway between two names the later one (210° reads Blue, 330° Red).
 */
export function nearestRange(wheelDeg: number): ColourRangeName {
  let best: ColourRangeName = 'red';
  let bestD = Infinity;
  for (const r of COLOUR_RANGES) {
    let d = wrap360(RANGE_WHEEL[r] - wheelDeg); // ≥ 0: the centre is at or after the hue
    if (d > 180) d -= 360;
    const a = Math.abs(d);
    if (a < bestD - 1e-9 || (Math.abs(a - bestD) <= 1e-9 && d > 0)) {
      best = r;
      bestD = a;
    }
  }
  return best;
}

// ── colour replace (RULE-25, F-028; ADR-0017 §5 and its 2026-11-26 Amendment) ───────────────────

/** RULE-25: at most three replacements per clip; Range and Softness defaults. */
export const REPLACE_MAX = 3;
export const REPLACE_RANGE = 30;
export const REPLACE_SOFTNESS = 50;

/** One stored replacement (schema `colourTools.replace[]`): From and To as #RRGGBB, Range and Softness 0–100. */
export interface ReplacementValues {
  readonly from: string;
  readonly to: string;
  readonly range: number;
  readonly softness: number;
}

/** RULE-25 *Matching*: the full distance either side of From's hue, 5° + 0.55° × Range (5° … 60°). */
export const replaceFull = (range: number): number => 5 + 0.55 * range;
/** RULE-25 *Matching*: the fade distance beyond it, 2° + (full − 2°) × Softness ÷ 100 (11.75° at the defaults). */
export const replaceFade = (range: number, softness: number): number => 2 + ((replaceFull(range) - 2) * softness) / 100;

/** Signed hue difference a − b in degrees, in (−180, 180] (the shader's form; equal wherever a weight is > 0). */
export function hueDelta(a: number, b: number): number {
  let d = wrap360(a - b);
  if (d > 180) d -= 360;
  return d;
}

/** CIELAB C* of an sRGB #RRGGBB colour (RULE-24's grey test; RULE-25's grey and faint From colours). */
export const hexChroma = (hex: string): number => {
  const [r, g, b] = hexRgb(hex);
  return cieChroma([srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]);
};

/**
 * Implements: RULE-25 *Grey and faint From colours* — a From colour with C* below 2 is `grey` (refused); from 2 to
 * below 12 it is `faint` (accepted: its matches lie in RULE-24's grey fade, COPY-notice.replace_faint); else `ok`.
 */
export function fromStatus(hex: string): 'grey' | 'faint' | 'ok' {
  const c = hexChroma(hex);
  return c < GREY_GATE[0] ? 'grey' : c < GREY_GATE[1] ? 'faint' : 'ok';
}

/**
 * One replacement as the grade uses it (ADR-0017 §5 Amendment): From's OKLCh hue, the full and fade distances, the
 * one turning direction Δ (the shorter signed angle From → To, +180° when exactly opposite), the chroma fade's ends
 * (¼ and ½ of From's OKLCh C), the chroma ratio To ÷ From, and whether To is grey (the hue is then not moved).
 */
export interface ReplaceParams {
  readonly fromH: number;
  readonly full: number;
  readonly fade: number;
  readonly delta: number;
  readonly cLo: number;
  readonly cHi: number;
  readonly ratio: number;
  readonly toGrey: boolean;
}

/**
 * Implements: RULE-25 *Each replacement*, *Matching*, *Change* — the grade parameters of one replacement, or null when
 * it changes nothing: To equal to From (RULE-25: "so it changes nothing until To is changed"), or a grey From colour
 * (never stored by the editor; a file may hold one).
 */
export function replaceParams(r: ReplacementValues): ReplaceParams | null {
  const from = r.from.toUpperCase();
  const to = r.to.toUpperCase();
  if (from === to || fromStatus(from) === 'grey') return null;
  const [, cFrom, fromH] = okLch(srgbToOklab(hexRgb(from)));
  const [, cTo, toH] = okLch(srgbToOklab(hexRgb(to)));
  const toGrey = hexChroma(to) < GREY_GATE[0];
  return {
    fromH,
    full: replaceFull(r.range),
    fade: replaceFade(r.range, r.softness),
    // RULE-25: the shorter way, increasing hue when exactly opposite (hueDelta is in (−180, 180]).
    delta: toGrey ? 0 : hueDelta(toH, fromH),
    cLo: cFrom / 4,
    cHi: cFrom / 2,
    // A grey To colour makes full matches grey (RULE-25 *Change*).
    ratio: toGrey ? 0 : cTo / cFrom,
    toGrey,
  };
}

/** RULE-25 *Matching*: a replacement's own match weight for a pixel of OKLCh chroma `C`, hue `h` and grey gate `g`. */
export function replaceOwnWeight(p: ReplaceParams, C: number, h: number, g: number): number {
  const d = Math.abs(hueDelta(h, p.fromH));
  return (1 - smoothstep(p.full, p.full + p.fade, d)) * smoothstep(p.cLo, p.cHi, C) * g;
}

/**
 * Implements: RULE-25 *Several replacements* — every replacement's effective weight on one OKLab colour, all matched
 * on the picture entering colour replace: own weight × (1 − the sum of the earlier effective weights).
 */
export function replaceWeights(lab: Vec3, ps: readonly ReplaceParams[]): number[] {
  const g = greyGate(oklabToLinear(lab));
  if (g <= 0) return ps.map(() => 0);
  const [, C, h] = okLch(lab);
  let sum = 0;
  return ps.map((p) => {
    const w = replaceOwnWeight(p, C, h, g) * (1 - sum);
    sum += w;
    return w;
  });
}

/**
 * Implements: RULE-25 *Change* and *Several replacements* (ADR-0017 §5 Amendment) on one OKLab colour, the CPU
 * reference of the shader's `replaceC`. Each replacement acts on its own share of the pixel (its effective weight w,
 * in list order): the hue turns by w × (Δ − d), d the signed angle From → h counted on the pixel's side of From, so
 * full matches land exactly on To's hue and neighbours turn by nearly the same angle (not at all for a grey To);
 * chroma × ((1 − Σw) + Σ w × ratio); lightness kept; the result brought into gamut at constant L and h (§2).
 */
export function replaceLab(lab: Vec3, ps: readonly ReplaceParams[]): Vec3 {
  if (ps.length === 0) return lab;
  const g = greyGate(oklabToLinear(lab));
  // A grey pixel (gate 0) is left exactly as it is, as in the shader, which so never takes atan(0, 0).
  if (g <= 0) return lab;
  const [L, C, h] = okLch(lab);
  let sum = 0;
  let dh = 0;
  let dc = 0;
  for (const p of ps) {
    const d = hueDelta(h, p.fromH);
    const w = (1 - smoothstep(p.full, p.full + p.fade, Math.abs(d))) * smoothstep(p.cLo, p.cHi, C) * g * (1 - sum);
    sum += w;
    if (!p.toGrey) dh += w * (p.delta - d);
    dc += w * (p.ratio - 1);
  }
  if (sum <= 0) return lab;
  return gamutLab(fromLch(L, C * (1 + dc), h + dh));
}
