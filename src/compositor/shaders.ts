// MOD-Compositor — the GLSL ES 3.00 programs of the passes in ADR-0006 §3 (promoted from SP-gpu-color,
// without the dropped "recompute the grade at each tap" variant, ADR-0006 outcome rule 1).
import { colourDefines, GLSL_COLOUR, GLSL_COMMON, GLSL_FINISH, GLSL_GRADE } from './grade';

export const VS = `#version 300 es
in vec2 aPos; in vec2 aTex; out vec2 vTex;
void main(){ vTex = aTex; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const HEAD = `#version 300 es
precision highp float; precision highp int; in vec2 vTex; out vec4 o;
`;

/** Premultiplied texture draw with an opacity (text bitmaps, Blur copy). */
export const FS_TEX = `${HEAD}uniform sampler2D uTex; uniform float uOpacity;
void main(){ o = texture(uTex, vTex) * uOpacity; }`;

const GRADE_MAIN = `uniform sampler2D uSrc; uniform vec2 uHalf; uniform bool uTaps;
void main(){
  vec3 c = uTaps
    ? 0.25 * (texture(uSrc, vTex + vec2(-uHalf.x, -uHalf.y)).rgb + texture(uSrc, vTex + vec2(uHalf.x, -uHalf.y)).rgb
            + texture(uSrc, vTex + vec2(-uHalf.x, uHalf.y)).rgb + texture(uSrc, vTex + vec2(uHalf.x, uHalf.y)).rgb)
    : texture(uSrc, vTex).rgb;
  o = vec4(grade(c), 1.0);
}`;

/**
 * Grade pass (RULE-08 up to Fade, with the RULE-24 colour stages in `stages`, `CT_*` of grade.ts) into the
 * intermediate; 4 taps when sampling down by 2× or more. One program per set of stages (ADR-0017 §9 fallback).
 */
export const fsGrade = (stages: number): string =>
  `#version 300 es\n${colourDefines(stages)}${HEAD.slice(HEAD.indexOf('\n') + 1)}${GLSL_COMMON}${GLSL_COLOUR}${GLSL_GRADE}${GRADE_MAIN}`;

/** Finish and place: Sharpen (unsharp mask), Vignette, Grain, drawn through the RULE-07 quad. */
export const FS_PLACE = `${HEAD}${GLSL_COMMON}${GLSL_FINISH}uniform sampler2D uSrc;
void main(){
  vec3 c = texture(uSrc, vTex).rgb;
  if (uSharpen > 0.0) {
    vec3 b = 0.25 * (texture(uSrc, vTex + vec2(uSharpStep.x, 0.0)).rgb + texture(uSrc, vTex - vec2(uSharpStep.x, 0.0)).rgb
                   + texture(uSrc, vTex + vec2(0.0, uSharpStep.y)).rgb + texture(uSrc, vTex - vec2(0.0, uSharpStep.y)).rgb);
    c = clamp(c + uSharpen * (c - b), 0.0, 1.0);
  }
  o = vec4(finish(c, vTex), 1.0);
}`;

/** Blur background, step 1: the graded clip covering the frame, sampled down with 4 taps. */
export const FS_DOWN = `${HEAD}uniform sampler2D uSrc; uniform vec2 uStep;
void main(){ o = vec4(0.25 * (texture(uSrc, vTex + uStep * vec2(-1.0, -1.0)).rgb + texture(uSrc, vTex + uStep * vec2(1.0, -1.0)).rgb
  + texture(uSrc, vTex + uStep * vec2(-1.0, 1.0)).rgb + texture(uSrc, vTex + uStep * vec2(1.0, 1.0)).rgb), 1.0); }`;

/** Blur background, step 2: a fixed separable 9-tap kernel (radius relative to s). */
export const FS_BLUR = `${HEAD}uniform sampler2D uTex; uniform vec2 uDir; uniform float uW[9];
void main(){ vec3 s = vec3(0.0); for (int i = 0; i < 9; i++) s += uW[i] * texture(uTex, vTex + uDir * float(i - 4)).rgb; o = vec4(s, 1.0); }`;

/**
 * Fades and cross-fades (RULE-10): each layer toward the fade target by its opacity, blended by weight.
 * A blank layer (its frame missing) is the background colour.
 */
export const FS_MIX = `${HEAD}uniform sampler2D uL0; uniform sampler2D uL1; uniform vec3 uBg; uniform vec3 uFadeTo;
uniform int uN; uniform float uW0, uA0, uW1, uA1; uniform bool uB0, uB1;
void main(){
  if (uN == 0) { o = vec4(uBg, 1.0); return; }
  vec3 c = uW0 * mix(uFadeTo, uB0 ? uBg : texture(uL0, vTex).rgb, uA0);
  if (uN > 1) c += uW1 * mix(uFadeTo, uB1 ? uBg : texture(uL1, vTex).rgb, uA1);
  o = vec4(c, 1.0);
}`;

/** Screen-only overlay lines (ADR-0006 §5), premultiplied colour. */
export const FS_SOLID = `${HEAD}uniform vec4 uColour; void main(){ o = vec4(uColour.rgb * uColour.a, uColour.a); }`;
