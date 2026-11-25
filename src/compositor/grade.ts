// MOD-Compositor — the RULE-08 grade: one definition of the maths, mirrored in GLSL (GLSL_GRADE /
// GLSL_FINISH) and in the CPU reference (`reference`), the test oracle of ADR-0006 §6. Promoted from
// SP-gpu-color (ΔE00 GPU vs CPU ≤ 0.74; RULE-08 ramp bars pass in the float reference and the
// half-float layer, ADR-0007 outcome).
// Implements: RULE-08 order — Temperature, Tint; Brightness, Contrast, Highlights, Shadows; Saturation,
// Vibrance; the look (RULE-09, intensity); Fade; Sharpen; Vignette; Grain. ADR-0007 §1: grading on
// encoded sRGB values in floating point; every stage clamps to [0, 1].
// Implements: RULE-24 *Order applied* (D-053, ADR-0017 §1): [1. colour replace — RULE-25, F-028, 1.3.0: its
// slot is the start of `grade`]; 2–4. the RULE-08 corrections; 5. colour mixer; 6. colour pop; 7. the look;
// 8. split toning; 9. duotone; 10. Fade, then the finish. Colour stages work in OKLab (MOD-Core `colour.ts`)
// and are skipped by uniform when off, so a clip without colour tools renders bit-identically (§6).
import {
  COLOUR_RANGES,
  DUOTONE_PAIR_COLOURS,
  duotoneLab,
  duotonePosition,
  hexRgb,
  hueTable,
  linearToOklab,
  linearToSrgb,
  mixPopLab,
  oklabToLinear,
  splitCrossover,
  splitLab,
  srgbToOklab,
  tintVector,
  type Adjustments,
  type ColourTools,
  type Look,
  type Vec3,
} from '../core';
import { lutSample, type LookTable } from './lut';

/** Rec. 709 luma weights (the working space's primaries, ADR-0007 §1). */
const K = [0.2126, 0.7152, 0.0722] as const;

export type Rgb = readonly [number, number, number];

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const luma = (c: Rgb): number => K[0] * c[0] + K[1] * c[1] + K[2] * c[2];
const map3 = (c: Rgb, f: (x: number, i: number) => number): Rgb => [f(c[0], 0), f(c[1], 1), f(c[2], 2)];

export const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const toSrgb = (l: number): number => (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);

/** Colour mixer and colour pop (RULE-24): the clip's hue table (ADR-0017 §3) and which of the two are on. */
export interface HueStage {
  /** Identifies the table's settings: the compositor uploads a table only when its key is new. */
  readonly key: string;
  readonly table: Float32Array;
  readonly mix: boolean;
  readonly pop: boolean;
}

/** Split toning (RULE-24): the two tint vectors in OKLab (a, b), scaled by strength, and the crossover L. */
export interface SplitStage {
  readonly shadows: readonly [number, number];
  readonly highlights: readonly [number, number];
  readonly crossover: number;
}

/** Duotone (RULE-24): the two colours in OKLab and Strength ÷ 100. */
export interface DuotoneStage {
  readonly shadows: Vec3;
  readonly highlights: Vec3;
  readonly strength: number;
}

/** The shader constants of one clip's grade and finish (slider values → curve gains). */
export interface GradeUniforms {
  readonly wbOn: boolean;
  readonly wb: Rgb;
  readonly bright: number;
  readonly contrast: number;
  readonly hi: number;
  readonly sh: number;
  readonly sat: number;
  readonly vib: number;
  /** Look id (null = None) and its mix: intensity ÷ 100 (RULE-09: 0 equals None). */
  readonly look: string | null;
  readonly lookMix: number;
  readonly fade: number;
  readonly sharpen: number;
  readonly vignette: number;
  readonly grain: number;
  /** RULE-24 colour tools; null when off (ADR-0017 §6: the stage is skipped). */
  readonly hue: HueStage | null;
  readonly split: SplitStage | null;
  readonly duotone: DuotoneStage | null;
}

/** Recently built hue tables by key (a pure memo: a table is 16 KB and depends only on its key). */
const tables = new Map<string, Float32Array>();
const TABLE_MEMO = 16;

/** Implements: ADR-0017 §3, §6 — the mixer and colour pop as a hue stage, or null when both are at default. */
function hueStage(t: ColourTools | undefined): HueStage | null {
  const mixer = t?.mixer;
  const mixOn = !!mixer && COLOUR_RANGES.some((r) => !!(mixer[r]?.hue || mixer[r]?.saturation || mixer[r]?.lightness));
  const pop = t?.pop;
  const popValues =
    pop?.colour && (pop.amount ?? 100) > 0
      ? { range: COLOUR_RANGES.indexOf(pop.colour), spread: pop.range ?? 50, amount: pop.amount ?? 100 }
      : null;
  if (!mixOn && !popValues) return null;
  const mix = mixOn ? COLOUR_RANGES.map((r) => mixer?.[r]) : [];
  const key = JSON.stringify([mix, popValues]);
  let table = tables.get(key);
  if (!table) {
    table = hueTable(mix, popValues);
    tables.set(key, table);
    if (tables.size > TABLE_MEMO) tables.delete(tables.keys().next().value!);
  }
  return { key, table, mix: mixOn, pop: popValues !== null };
}

/** Implements: RULE-24 split toning as uniforms (ADR-0017 §4), or null when both strengths are 0. */
function splitStage(t: ColourTools | undefined): SplitStage | null {
  const s = t?.splitToning;
  const ss = (s?.shadowsStrength ?? 0) / 100;
  const hs = (s?.highlightsStrength ?? 0) / 100;
  if (ss <= 0 && hs <= 0) return null;
  const sv = tintVector(s?.shadowsHue ?? 210);
  const hv = tintVector(s?.highlightsHue ?? 35);
  return {
    shadows: [sv[0] * ss, sv[1] * ss],
    highlights: [hv[0] * hs, hv[1] * hs],
    crossover: splitCrossover(s?.balance ?? 0),
  };
}

/** Implements: RULE-24 duotone as uniforms, or null when None or Strength 0. */
function duotoneStage(t: ColourTools | undefined): DuotoneStage | null {
  const d = t?.duotone;
  if (!d?.on || d.strength <= 0) return null;
  const pair = d.pair !== 'custom' ? DUOTONE_PAIR_COLOURS[d.pair] : d;
  return {
    shadows: srgbToOklab(hexRgb(pair.shadows)),
    highlights: srgbToOklab(hexRgb(pair.highlights)),
    strength: d.strength / 100,
  };
}

/**
 * Implements: RULE-08 ranges → curve gains, chosen so every tone curve is monotone with slope ≤ 2 on
 * grey (SP-gpu-color); RULE-09 intensity. All-default adjustments and no look give the identity.
 */
export function gradeUniforms(a: Adjustments, look: Look, colourTools?: ColourTools): GradeUniforms {
  const t = (a.temperature ?? 0) / 100;
  const ti = (a.tint ?? 0) / 100;
  const raw: Rgb = [1 + 0.25 * t, 1 - 0.2 * ti, 1 - 0.25 * t];
  const n = luma(raw); // keeps the luminance of white
  const c = (a.contrast ?? 0) / 100;
  return {
    wbOn: t !== 0 || ti !== 0,
    wb: map3(raw, (g) => g / n),
    bright: (0.8 * (a.brightness ?? 0)) / 100,
    contrast: c >= 0 ? 0.8 * c : c, // ≥ 0: S-curve mix; < 0: compression toward 0.5 (×0.5 at −100)
    hi: (0.9 * (a.highlights ?? 0)) / 100,
    sh: (0.9 * (a.shadows ?? 0)) / 100,
    sat: (a.saturation ?? 0) / 100,
    vib: (a.vibrance ?? 0) / 100,
    look: look && look.intensity > 0 ? look.id : null,
    lookMix: look ? look.intensity / 100 : 0,
    fade: (a.fade ?? 0) / 100,
    sharpen: (1.2 * (a.sharpen ?? 0)) / 100,
    vignette: (0.75 * (a.vignette ?? 0)) / 100,
    grain: (0.12 * (a.grain ?? 0)) / 100,
    hue: hueStage(colourTools),
    split: splitStage(colourTools),
    duotone: duotoneStage(colourTools),
  };
}

/** The identity grade (compare hold, RULE-08 / RULE-24: the clip without adjustments, colour tools and look). */
export const NEUTRAL: GradeUniforms = gradeUniforms({}, null);

const lin3 = (c: Rgb): Vec3 => [toLinear(c[0]), toLinear(c[1]), toLinear(c[2])];
const srgb3 = (l: Vec3): Rgb => [linearToSrgb(clamp01(l[0])), linearToSrgb(clamp01(l[1])), linearToSrgb(clamp01(l[2]))];

/** RULE-24 steps 5–6 (CPU reference of GLSL `mixPop`): one OKLab round trip. */
function mixPop(c: Rgb, h: HueStage): Rgb {
  return srgb3(oklabToLinear(mixPopLab(linearToOklab(lin3(c)), h.table, h.mix, h.pop)));
}

/** RULE-24 steps 8–9 (CPU reference of GLSL `splitDuo`): one conversion shared by split toning and duotone. */
function splitDuo(c: Rgb, s: SplitStage | null, d: DuotoneStage | null): Rgb {
  let lin = lin3(c);
  if (s) {
    const l = oklabToLinear(splitLab(linearToOklab(lin), s.shadows, s.highlights, s.crossover));
    lin = [clamp01(l[0]), clamp01(l[1]), clamp01(l[2])];
  }
  let out = srgb3(lin);
  if (d) {
    const g = srgb3(oklabToLinear(duotoneLab(d.shadows, d.highlights, duotonePosition(lin))));
    out = map3(out, (x, i) => clamp01(x + (g[i]! - x) * d.strength));
  }
  return out;
}

/** CPU reference of the grade pass (before the finish). `rgb` in [0, 1]. */
function grade(rgb: Rgb, u: GradeUniforms, table: LookTable | null): Rgb {
  // 1. Colour replace (RULE-25, F-028): its stage goes here, on the source's own colours (ADR-0017 §5).
  let c = map3(rgb, clamp01);
  if (u.wbOn) c = map3(c, (x, i) => clamp01(toSrgb(clamp01(toLinear(x) * u.wb[i]!))));
  c = map3(c, (x) => clamp01(x + u.bright * x * (1 - x)));
  c = map3(c, (x) =>
    clamp01(u.contrast >= 0 ? x + u.contrast * (x * x * (3 - 2 * x) - x) : x + 0.5 * u.contrast * (x - 0.5)),
  );
  let y = luma(c);
  const dy = u.sh * y * (1 - y) * (1 - y) + u.hi * y * y * (1 - y);
  c = map3(c, (x) => clamp01(x + dy));
  y = luma(c);
  c = map3(c, (x) => clamp01(y + (x - y) * (1 + u.sat)));
  y = luma(c);
  const m = Math.max(...c) - Math.min(...c);
  c = map3(c, (x) => clamp01(y + (x - y) * (1 + u.vib * (1 - m))));
  if (u.hue) c = mixPop(c, u.hue);
  if (u.lookMix > 0 && table) {
    const L = lutSample(table, c);
    c = map3(c, (x, i) => x + (L[i]! - x) * u.lookMix);
  }
  if (u.split || u.duotone) c = splitDuo(c, u.split, u.duotone);
  if (u.fade > 0) {
    y = luma(c);
    c = map3(c, (x) => x + (y - x) * 0.25 * u.fade);
    c = map3(c, (x) => clamp01(0.25 * u.fade + (1 - 0.25 * u.fade) * x));
  }
  return c;
}

/** PCG output function on uint32 (shared with GLSL `pcg`). */
export function pcg(v: number): number {
  const s = (Math.imul(v >>> 0, 747796405) + 2891336453) >>> 0;
  const w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
  return ((w >>> 22) ^ w) >>> 0;
}

/** ADR-0006 §4: grain noise in [0, 1] for an output cell, project frame index and clip. */
export const grainHash = (x: number, y: number, frame: number, clip: number): number =>
  pcg((x ^ pcg((y ^ pcg((frame ^ pcg(clip)) >>> 0)) >>> 0)) >>> 0) / 4294967295;

/** Grain cell size in output pixels, relative to `s` (RULE-08): 2 px at 1080. */
export const grainCell = (s: number): number => s / 540;

/** A clip id as the grain hash's uint32 (FNV-1a), so grain differs per clip but never per play. */
export function clipHash(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export interface FinishAt {
  /** Clip texture coordinate (vignette is relative to the clip). */
  readonly uv: readonly [number, number];
  /** Output pixel (GL convention, bottom-up rows). */
  readonly frag: readonly [number, number];
  readonly frame: number;
  readonly clip: number;
  readonly s: number;
}

/** CPU reference of the per-pixel finish (sharpen is spatial: a no-op on flat patches). */
function finish(c: Rgb, u: GradeUniforms, at: FinishAt): Rgb {
  if (u.vignette > 0) {
    const r = Math.hypot((at.uv[0] - 0.5) * 2, (at.uv[1] - 0.5) * 2) / Math.SQRT2;
    const t = Math.min(1, Math.max(0, (r - 0.35) / 0.65));
    const sm = t * t * (3 - 2 * t);
    c = map3(c, (x) => x * (1 - u.vignette * sm));
  }
  if (u.grain > 0) {
    const cell = grainCell(at.s);
    const n = grainHash(
      Math.floor((at.frag[0] + 0.5) / cell),
      Math.floor((at.frag[1] + 0.5) / cell),
      at.frame,
      at.clip,
    );
    const y = luma(c);
    c = map3(c, (x) => clamp01(x + u.grain * (n - 0.5) * (0.35 + 2.6 * y * (1 - y))));
  }
  return c;
}

/** The CPU oracle (ADR-0006 §6) — tests only; the shaders below must match it. */
export const reference = {
  grade: (
    rgb: Rgb,
    a: Adjustments,
    look: Look = null,
    table: LookTable | null = null,
    colourTools?: ColourTools,
  ): Rgb => grade(rgb, gradeUniforms(a, look, colourTools), table),
  gradeWith: grade,
  finish,
};

export const GLSL_COMMON = `
const vec3 K = vec3(0.2126, 0.7152, 0.0722);
vec3 toLin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
vec3 toSrgb(vec3 l){ return mix(l * 12.92, 1.055 * pow(l, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), l)); }
uint pcg(uint v){ uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
`;

/**
 * RULE-24 colour stages in OKLab (ADR-0017 §2–§4), mirroring MOD-Core `colour.ts` line for line: the
 * conversions, the gamut reduction (8 halvings at constant L and h), the grey gate, the hue table (one
 * 1,024-entry RGBA16F texture: hue shift in turns, chroma factor, lightness move, pop loss) and the tints.
 * Which stages run is compiled in (CT_MIX, CT_POP, CT_SPLIT, CT_DUO: one program per set of tools on, the
 * fallback of ADR-0017 §9 that SP-colour-tools chose), so a clip without colour tools runs the 1.1.0 grade.
 */
export const GLSL_COLOUR = `
uniform highp sampler2D uHue;
uniform vec2 uSplitSh, uSplitHi; uniform float uSplitX;
uniform vec3 uDuoSh, uDuoHi; uniform float uDuoStr;
const float TAU = 6.28318530718;
vec3 cbrt3(vec3 x){ return sign(x) * pow(abs(x), vec3(1.0 / 3.0)); }
vec3 linToOklab(vec3 c){
  vec3 lms = cbrt3(mat3(0.4122214708, 0.2119034982, 0.0883024619, 0.5363325363, 0.6806995451, 0.2817188376,
                        0.0514459929, 0.1073969566, 0.6299787005) * c);
  return mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.7936177850, -2.4285922050, 0.7827717662,
              -0.0040720468, 0.4505937099, -0.8086757660) * lms;
}
vec3 oklabToLin(vec3 l){
  vec3 lms = mat3(1.0, 1.0, 1.0, 0.3963377774, -0.1055613458, -0.0894841775, 0.2158037573, -0.0638541728,
                  -1.2914855480) * l;
  lms = lms * lms * lms;
  return mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147,
              0.2309699292, -0.3413193965, 1.7076147010) * lms;
}
bool inGamut(vec3 l){ return all(greaterThanEqual(l, vec3(-1e-4))) && all(lessThanEqual(l, vec3(1.0001))); }
// The cube-root LMS values are linear in the chroma scale m (lms_ = L + m·d), so each halving costs one cube and
// one matrix (the same values as oklabToLin of the scaled colour).
const mat3 LMS_TO_LIN = mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147,
                             0.2309699292, -0.3413193965, 1.7076147010);
vec3 gamutLab(vec3 lab){
  vec3 d = mat3(0.0, 0.0, 0.0, 0.3963377774, -0.1055613458, -0.0894841775, 0.2158037573, -0.0638541728,
                -1.2914855480) * vec3(0.0, lab.yz);
  vec3 q = lab.x + d;
  if (inGamut(LMS_TO_LIN * (q * q * q))) return lab;
  float lo = 0.0, hi = 1.0;
  for (int i = 0; i < 8; i++) {
    float m = 0.5 * (lo + hi);
    q = lab.x + m * d;
    if (inGamut(LMS_TO_LIN * (q * q * q))) lo = m; else hi = m;
  }
  return vec3(lab.x, lab.yz * lo);
}
// RULE-24 grey fade on CIELAB C* (2 → 12) of linear values (SP-colour-tools: the OK-chroma stand-in failed below L* 10).
float greyGate(vec3 lin){
  vec3 t = mat3(0.4124564 / 0.95047, 0.2126729, 0.0193339 / 1.08883, 0.3575761 / 0.95047, 0.7151522, 0.119192 / 1.08883,
                0.1804375 / 0.95047, 0.072175, 0.9503041 / 1.08883) * lin;
  vec3 f = mix((24389.0 / 27.0 * t + 16.0) / 116.0, cbrt3(t), step(vec3(216.0 / 24389.0), t));
  return smoothstep(2.0, 12.0, length(vec2(500.0 * (f.x - f.y), 200.0 * (f.y - f.z))));
}
vec4 hueAt(float turns){ return texture(uHue, vec2(turns + 0.5 / 1024.0, 0.5)); }
#if CT_MIX || CT_POP
vec3 mixPop(vec3 c){
  vec3 lin = toLin(c);
  vec3 lab = linToOklab(lin);
  float L = lab.x, C = length(lab.yz), h = atan(lab.z, lab.y) / TAU;
  float g = greyGate(lin);
#if CT_MIX
  vec4 e = hueAt(h);
  h += g * e.r;
  C *= 1.0 + g * (e.g - 1.0);
  float mv = g * e.b;
  L += mv > 0.0 ? (1.0 - L) * 0.5 * mv : L * 0.5 * mv;
  lab = gamutLab(vec3(L, C * cos(h * TAU), C * sin(h * TAU)));
#if !CT_POP
  return toSrgb(clamp(oklabToLin(lab), 0.0, 1.0));
#else
  C = length(lab.yz);
  g = greyGate(oklabToLin(lab));
#endif
#endif
#if CT_POP
  lab.yz *= 1.0 - g * hueAt(h).a;
  return toSrgb(clamp(oklabToLin(lab), 0.0, 1.0));
#endif
}
#endif
#if CT_SPLIT || CT_DUO
vec3 splitDuo(vec3 c){
  vec3 lin = toLin(c);
#if CT_SPLIT
  vec3 lab = linToOklab(lin);
  float w = smoothstep(uSplitX - 0.15, uSplitX + 0.15, lab.x);
  float e = smoothstep(0.0, 0.2, lab.x) * (1.0 - smoothstep(0.8, 1.0, lab.x));
  lab.yz += e * (1.0 - w) * uSplitSh + e * w * uSplitHi;
  lin = clamp(oklabToLin(gamutLab(lab)), 0.0, 1.0);
#endif
  vec3 o = toSrgb(lin);
#if CT_DUO
  float Y = dot(lin, K);
  float t = clamp((Y > 216.0 / 24389.0 ? 116.0 * pow(Y, 1.0 / 3.0) - 16.0 : (24389.0 / 27.0) * Y) / 100.0, 0.0, 1.0);
  vec3 d = toSrgb(clamp(oklabToLin(gamutLab(mix(uDuoSh, uDuoHi, t))), 0.0, 1.0));
  o = clamp(mix(o, d, uDuoStr), 0.0, 1.0);
#endif
  return o;
}
#endif
`;

/** The colour stages compiled into a grade program (ADR-0017 §9 fallback: one program per set). */
export const CT_MIX = 1;
export const CT_POP = 2;
export const CT_SPLIT = 4;
export const CT_DUO = 8;

/** Implements: ADR-0017 §6, §9 — which colour stages a clip's grade needs (0: the 1.1.0 grade). */
export const colourStages = (u: GradeUniforms): number =>
  (u.hue?.mix ? CT_MIX : 0) | (u.hue?.pop ? CT_POP : 0) | (u.split ? CT_SPLIT : 0) | (u.duotone ? CT_DUO : 0);

/** The preprocessor lines that select the stages (after `#version`). */
export const colourDefines = (stages: number): string =>
  `#define CT_MIX ${stages & CT_MIX ? 1 : 0}\n#define CT_POP ${stages & CT_POP ? 1 : 0}\n` +
  `#define CT_SPLIT ${stages & CT_SPLIT ? 1 : 0}\n#define CT_DUO ${stages & CT_DUO ? 1 : 0}\n`;

export const GLSL_GRADE = `
uniform bool uWBOn; uniform vec3 uWB; uniform float uBright, uContrast, uHi, uSh, uSat, uVib, uLookMix, uFade;
uniform mediump sampler3D uLut;
vec3 grade(vec3 c){
  // 1. Colour replace (RULE-25, F-028, 1.3.0): ADR-0017 §5's stage goes here, before Temperature and Tint.
  c = clamp(c, 0.0, 1.0);
  if (uWBOn) c = clamp(toSrgb(clamp(toLin(c) * uWB, 0.0, 1.0)), 0.0, 1.0);
  c = clamp(c + uBright * c * (1.0 - c), 0.0, 1.0);
  c = clamp(uContrast >= 0.0 ? c + uContrast * (c * c * (3.0 - 2.0 * c) - c) : c + 0.5 * uContrast * (c - 0.5), 0.0, 1.0);
  float y = dot(c, K);
  c = clamp(c + (uSh * y * (1.0 - y) * (1.0 - y) + uHi * y * y * (1.0 - y)), 0.0, 1.0);
  y = dot(c, K);
  c = clamp(y + (c - y) * (1.0 + uSat), 0.0, 1.0);
  y = dot(c, K);
  float m = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = clamp(y + (c - y) * (1.0 + uVib * (1.0 - m)), 0.0, 1.0);
#if CT_MIX || CT_POP
  c = mixPop(c);
#endif
  if (uLookMix > 0.0) c = mix(c, texture(uLut, c * (32.0 / 33.0) + 0.5 / 33.0).rgb, uLookMix);
#if CT_SPLIT || CT_DUO
  c = splitDuo(c);
#endif
  if (uFade > 0.0) { y = dot(c, K); c = mix(c, vec3(y), 0.25 * uFade); c = clamp(0.25 * uFade + (1.0 - 0.25 * uFade) * c, 0.0, 1.0); }
  return c;
}
`;

export const GLSL_FINISH = `
uniform float uSharpen, uVignette, uGrain, uGrainCell; uniform vec2 uSharpStep; uniform uint uFrame, uClip;
vec3 finish(vec3 c, vec2 uv){
  if (uVignette > 0.0) { float r = length((uv - 0.5) * 2.0) / 1.41421356; c *= 1.0 - uVignette * smoothstep(0.35, 1.0, r); }
  if (uGrain > 0.0) {
    uvec2 cell = uvec2(floor(gl_FragCoord.xy / uGrainCell));
    float n = float(pcg(cell.x ^ pcg(cell.y ^ pcg(uFrame ^ pcg(uClip))))) / 4294967295.0;
    float y = dot(c, K);
    c = clamp(c + uGrain * (n - 0.5) * (0.35 + 2.6 * y * (1.0 - y)), 0.0, 1.0);
  }
  return c;
}
`;
