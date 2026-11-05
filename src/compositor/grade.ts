// MOD-Compositor — the RULE-08 grade: one definition of the maths, mirrored in GLSL (GLSL_GRADE /
// GLSL_FINISH) and in the CPU reference (`reference`), the test oracle of ADR-0006 §6. Promoted from
// SP-gpu-color (ΔE00 GPU vs CPU ≤ 0.74; RULE-08 ramp bars pass in the float reference and the
// half-float layer, ADR-0007 outcome).
// Implements: RULE-08 order — Temperature, Tint; Brightness, Contrast, Highlights, Shadows; Saturation,
// Vibrance; the look (RULE-09, intensity); Fade; Sharpen; Vignette; Grain. ADR-0007 §1: grading on
// encoded sRGB values in floating point; every stage clamps to [0, 1].
import type { Adjustments, Look } from '../core';
import { lutSample, type LookTable } from './lut';

/** Rec. 709 luma weights (the working space's primaries, ADR-0007 §1). */
const K = [0.2126, 0.7152, 0.0722] as const;

export type Rgb = readonly [number, number, number];

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const luma = (c: Rgb): number => K[0] * c[0] + K[1] * c[1] + K[2] * c[2];
const map3 = (c: Rgb, f: (x: number, i: number) => number): Rgb => [f(c[0], 0), f(c[1], 1), f(c[2], 2)];

export const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const toSrgb = (l: number): number => (l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055);

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
}

/**
 * Implements: RULE-08 ranges → curve gains, chosen so every tone curve is monotone with slope ≤ 2 on
 * grey (SP-gpu-color); RULE-09 intensity. All-default adjustments and no look give the identity.
 */
export function gradeUniforms(a: Adjustments, look: Look): GradeUniforms {
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
  };
}

/** The identity grade (compare hold, RULE-08: the clip without adjustments and look). */
export const NEUTRAL: GradeUniforms = gradeUniforms({}, null);

/** CPU reference of the grade pass (before the finish). `rgb` in [0, 1]. */
function grade(rgb: Rgb, u: GradeUniforms, table: LookTable | null): Rgb {
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
  if (u.lookMix > 0 && table) {
    const L = lutSample(table, c);
    c = map3(c, (x, i) => x + (L[i]! - x) * u.lookMix);
  }
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
  grade: (rgb: Rgb, a: Adjustments, look: Look = null, table: LookTable | null = null): Rgb =>
    grade(rgb, gradeUniforms(a, look), table),
  gradeWith: grade,
  finish,
};

export const GLSL_COMMON = `
const vec3 K = vec3(0.2126, 0.7152, 0.0722);
vec3 toLin(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }
vec3 toSrgb(vec3 l){ return mix(l * 12.92, 1.055 * pow(l, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), l)); }
uint pcg(uint v){ uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
`;

export const GLSL_GRADE = `
uniform bool uWBOn; uniform vec3 uWB; uniform float uBright, uContrast, uHi, uSh, uSat, uVib, uLookMix, uFade;
uniform mediump sampler3D uLut;
vec3 grade(vec3 c){
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
  if (uLookMix > 0.0) c = mix(c, texture(uLut, c * (32.0 / 33.0) + 0.5 / 33.0).rgb, uLookMix);
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
