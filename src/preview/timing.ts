// MOD-Preview — pure playhead and surface-size maths (F-002.R2–R5, NFR-03), tested without a DOM.
import { frameIndexAt, frameStart, type FrameRate, type Micros } from '../core';

/** The preview's shorter side is capped at the export's 1080 (MOD-Preview responsibility). */
export const PREVIEW_MAX_SHORT = 1080;

/**
 * Device-pixel size of the preview surface: the frame aspect (width ÷ height) fitted inside the
 * element's CSS box, times the device pixel ratio, with the shorter side capped at 1080.
 */
export function previewSize(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  aspect: number,
): { width: number; height: number; cssWidth: number; cssHeight: number } {
  const boxW = Math.max(1, cssWidth);
  const boxH = Math.max(1, cssHeight);
  const fitW = Math.min(boxW, boxH * aspect);
  const fitH = fitW / aspect;
  let w = fitW * Math.max(1, dpr);
  let h = fitH * Math.max(1, dpr);
  const short = Math.min(w, h);
  if (short > PREVIEW_MAX_SHORT) {
    w = (w * PREVIEW_MAX_SHORT) / short;
    h = (h * PREVIEW_MAX_SHORT) / short;
  }
  return {
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
    cssWidth: fitW,
    cssHeight: fitH,
  };
}

/** A playhead time inside the project: [0, end]. */
export const clampTime = (t: Micros, end: Micros): Micros => Math.min(Math.max(0, Math.round(t)), Math.max(0, end));

/** F-002 edge case: Play at the project end starts from 0. */
export const playFrom = (t: Micros, end: Micros): Micros => (t >= end ? 0 : clampTime(t, end));

/**
 * Implements: F-002.R4 — one frame back or forward (n frames), landing on frame starts; the end of the
 * project is the last stop.
 */
export function stepTime(t: Micros, n: number, rate: FrameRate, end: Micros): Micros {
  const last = frameIndexAt(Math.max(0, end), rate);
  const k = Math.min(last, Math.max(0, frameIndexAt(clampTime(t, end), rate) + n));
  return Math.min(frameStart(k, rate), end);
}

/** Pause keeps the playhead where it is, on the start of the frame being shown (F-002.R2). */
export const pausedAt = (t: Micros, rate: FrameRate, end: Micros): Micros =>
  Math.min(frameStart(frameIndexAt(clampTime(t, end), rate), rate), end);
