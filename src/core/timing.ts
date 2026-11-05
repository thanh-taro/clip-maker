// MOD-Core — main-track timing: clip lengths, the gap-free layout, fade and cross-fade limits and
// shrinking, and RULE-03 length fitting. Pure; works on whole frames.
// Implements: RULE-03, RULE-05, RULE-06 (timeline length), RULE-10 (limits, shrinking), INV-03, INV-04.
import type { Clip, Project } from './project.gen';
import { RULE_03, RULE_06, RULE_10 } from './limits';
import {
  frameStart,
  framesOf,
  halfFrames,
  minFrames,
  minFramesForTenths,
  secondsToFrames,
  type FrameRate,
  type Micros,
} from './time';

/** RULE-03: the longest project, in frames (INV-04). */
export const maxProjectFrames = (rate: FrameRate): number => secondsToFrames(RULE_03.maxProjectSeconds, rate);
/** RULE-10: the shortest cross-fade, in frames (0.1 s rounded up). */
export const minCrossFadeFrames = (rate: FrameRate): number => minFramesForTenths(RULE_10.crossFadeMinTenths, rate);
/** RULE-10: the longest cross-fade, in frames. */
export const maxCrossFadeFrames = (rate: FrameRate): number => secondsToFrames(RULE_10.crossFadeMaxSeconds, rate);
/** RULE-10: the longest clip fade in or fade out, in frames. */
export const maxClipFadeFrames = (rate: FrameRate): number => secondsToFrames(RULE_10.clipFadeMaxSeconds, rate);

export const speedOf = (clip: Clip): number => clip.speedPct ?? RULE_06.defaultPct;
export const sourceRange = (clip: Clip): Micros => (clip.out ?? 0) - (clip.in ?? 0);

/**
 * A clip's length on the timeline in frames. Photo: its stored duration. Video: its source range
 * divided by the speed, rounded to whole frames (RULE-06).
 */
export function clipFrames(clip: Clip, rate: FrameRate): number {
  if (clip.kind === 'photo') return framesOf(clip.duration ?? 0, rate);
  return Math.round((sourceRange(clip) * rate * 100) / (speedOf(clip) * 1_000_000));
}

/** The source range that gives a video clip exactly n frames at a speed (shortening at an edge). */
export function rangeForFrames(n: number, speedPct: number, rate: FrameRate): Micros {
  return Math.floor((frameStart(n, rate) * speedPct) / 100);
}

/** A copy of the clip set to n frames, cutting or extending at its end (or its start, video only). */
export function withFrames(clip: Clip, n: number, rate: FrameRate, edge: 'start' | 'end' = 'end'): Clip {
  if (clip.kind === 'photo') {
    const duration = frameStart(n, rate);
    return duration === clip.duration ? clip : { ...clip, duration };
  }
  const range = rangeForFrames(n, speedOf(clip), rate);
  if (edge === 'end') {
    const out = (clip.in ?? 0) + range;
    return out === clip.out ? clip : { ...clip, out };
  }
  const inPoint = Math.max(0, (clip.out ?? 0) - range);
  return inPoint === clip.in ? clip : { ...clip, in: inPoint };
}

export interface ClipSpan {
  readonly startFrame: number;
  readonly frames: number;
  /** Exclusive. */
  readonly endFrame: number;
  /** Frames of the cross-fade into the next clip (0 when none or last). */
  readonly crossFadeFrames: number;
}

export interface Layout {
  readonly spans: readonly ClipSpan[];
  /** Project length in frames: the main track's end (INV-03). */
  readonly frames: number;
}

const layoutCache = new WeakMap<readonly Clip[], Map<FrameRate, Layout>>();

/**
 * INV-03: clips sit end to end from 0, each cross-fade overlapping two neighbours by its duration.
 * Boundaries are computed cumulatively in whole frames (rules.md "Frame times").
 */
export function layoutClips(clips: readonly Clip[], rate: FrameRate): Layout {
  let byRate = layoutCache.get(clips);
  const cached = byRate?.get(rate);
  if (cached) return cached;
  const spans: ClipSpan[] = [];
  let start = 0;
  let end = 0;
  clips.forEach((clip, i) => {
    const frames = clipFrames(clip, rate);
    const crossFadeFrames = i < clips.length - 1 ? framesOf(clip.crossFadeNext, rate) : 0;
    end = start + frames;
    spans.push({ startFrame: start, frames, endFrame: end, crossFadeFrames });
    start = end - crossFadeFrames;
  });
  const layout: Layout = { spans, frames: end };
  if (!byRate) layoutCache.set(clips, (byRate = new Map()));
  byRate.set(rate, layout);
  return layout;
}

export const layoutOf = (project: Project): Layout => layoutClips(project.clips, project.frame.frameRate);
/** The project length in frames. */
export const projectFrames = (project: Project): number => layoutOf(project).frames;
/** The project end (its length) in µs. */
export const projectEnd = (project: Project): Micros => frameStart(projectFrames(project), project.frame.frameRate);

/** RULE-10: the largest cross-fade, in frames, allowed between clips of these lengths. */
export function crossFadeLimit(framesA: number, framesB: number, rate: FrameRate): number {
  return Math.min(maxCrossFadeFrames(rate), halfFrames(framesA), halfFrames(framesB));
}

/**
 * RULE-10 "when a clip gets shorter": every cross-fade shrinks to half of either neighbour (removed
 * below 0.1 s) and fade in + fade out shrink in proportion to fit the clip. Idempotent; returns the
 * same array when nothing needs to change (structural sharing, ADR-0011).
 */
export function normaliseClips(clips: readonly Clip[], rate: FrameRate): readonly Clip[] {
  const frames = clips.map((c) => clipFrames(c, rate));
  let changed = false;
  const next = clips.map((clip, i) => {
    const length = frames[i] ?? 0;
    let crossFadeNext = clip.crossFadeNext;
    if (i === clips.length - 1) crossFadeNext = 0;
    else if (crossFadeNext > 0) {
      const wanted = framesOf(crossFadeNext, rate);
      const fit = Math.min(wanted, crossFadeLimit(length, frames[i + 1] ?? 0, rate));
      if (fit < minCrossFadeFrames(rate)) crossFadeNext = 0;
      else if (fit !== wanted) crossFadeNext = frameStart(fit, rate);
    }
    let fadeIn = clip.fadeIn;
    let fadeOut = clip.fadeOut;
    const fi = framesOf(fadeIn, rate);
    const fo = framesOf(fadeOut, rate);
    if (fi + fo > length) {
      // Shrink in proportion; whole frames round down so the sum fits.
      fadeIn = frameStart(Math.floor((fi * length) / (fi + fo)), rate);
      fadeOut = frameStart(Math.floor((fo * length) / (fi + fo)), rate);
    }
    if (crossFadeNext === clip.crossFadeNext && fadeIn === clip.fadeIn && fadeOut === clip.fadeOut) return clip;
    changed = true;
    return { ...clip, crossFadeNext, fadeIn, fadeOut };
  });
  return changed ? next : clips;
}

/**
 * RULE-03: set clip `index` to the longest length ≤ `wanted` frames (and ≥ `floor`) at which the
 * normalised main track stays within the limit. Returns null when not even `floor` fits.
 */
export function fitClipFrames(
  clips: readonly Clip[],
  index: number,
  wanted: number,
  floor: number,
  rate: FrameRate,
  edge: 'start' | 'end' = 'end',
): { clips: readonly Clip[]; frames: number } | null {
  const max = maxProjectFrames(rate);
  const clip = clips[index];
  if (!clip) return null;
  let n = wanted;
  while (n >= floor && n > 0) {
    const tried = clips.slice();
    // At the clip's own length keep it as it is (its range may not be a whole-frame value).
    tried[index] = n === clipFrames(clip, rate) ? clip : withFrames(clip, n, rate, edge);
    const normal = normaliseClips(tried, rate);
    const total = layoutClips(normal, rate).frames;
    if (total <= max) return { clips: normal, frames: n };
    n -= Math.max(1, total - max);
  }
  return null;
}

/** The minimum length of a main-track clip in frames (RULE-05). */
export const minClipFrames = minFrames;
