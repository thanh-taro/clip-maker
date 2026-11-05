// MOD-Core — the rule maths behind individual edits (ADR-0011 §2): source length minimum, speed
// steps and stops, the split cut, re-timing on a frame-rate change, and audio trims and fades.
// MOD-Project composes these into operations.
import type { AudioClip, Clip, Source } from './project.gen';
import { audioEnd } from './audio';
import { RULE_04, RULE_06, RULE_10 } from './limits';
import {
  frameAtOrAfter,
  frameIndexAt,
  frameStart,
  framesOf,
  minDuration,
  minFrames,
  nearestFrame,
  secondsToFrames,
  type FrameRate,
  type Micros,
} from './time';
import { clipFrames, minCrossFadeFrames, rangeForFrames, speedOf, type ClipSpan } from './timing';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Implements: RULE-02 "too short" with RULE-05's minimum (spec question 7): the shortest video or
 * audio source accepted — the 0.1 s minimum rounded up to whole frames at the slowest RULE-04 rate
 * (0.125 s at 24 fps), so no later frame-rate change can take a clip of it below its minimum.
 */
export const MIN_SOURCE_DURATION: Micros = Math.max(...RULE_04.frameRates.map((r) => minDuration(r)));

/** Implements: RULE-02 — a timed source shorter than the minimum is refused (COPY-reason.too_short). */
export const isTooShort = (source: Source): boolean =>
  source.kind !== 'photo' && (source.duration ?? 0) < MIN_SOURCE_DURATION;

/** Implements: RULE-06 — a speed request as a 0.05× step within 0.25×–4× (speed × 100). */
export const speedStep = (speedPct: number): number =>
  clamp(Math.round(speedPct / RULE_06.stepPct) * RULE_06.stepPct, RULE_06.minPct, RULE_06.maxPct);

/**
 * Implements: RULE-06 stops — an increase stops at the fastest step keeping the clip at its minimum
 * length; then, while `fits(speed)` is false, the speed rises toward the current one (the slowest
 * step that fits). Returns the speed to apply and whether RULE-03 limited it.
 */
export function speedFor(
  clip: Clip,
  requestedPct: number,
  rate: FrameRate,
  fits: (speedPct: number) => boolean,
): { speedPct: number; limited: boolean } {
  const step = RULE_06.stepPct;
  const current = speedOf(clip);
  let want = speedStep(requestedPct);
  while (want > current && clipFrames({ ...clip, speedPct: want }, rate) < minFrames(rate)) want -= step;
  let limited = false;
  while (want < current && !fits(want)) {
    want += step;
    limited = true;
  }
  return { speedPct: want, limited };
}

/**
 * Implements: RULE-05 split of a main-track clip at frame k: both halves keep every setting; only
 * the first keeps the fade in, only the second the fade out and the cross-fade into the next clip;
 * a split inside a cross-fade removes it. Null when k is closer than the minimum to either end.
 */
export function splitClip(
  clip: Clip,
  span: ClipSpan,
  incomingCrossFadeFrames: number,
  k: number,
  rate: FrameRate,
  secondId: string,
): { first: Clip; second: Clip; removeIncoming: boolean } | null {
  const min = minFrames(rate);
  const head = k - span.startFrame;
  if (head < min || span.endFrame - k < min) return null;
  let first: Clip;
  let second: Clip;
  if (clip.kind === 'photo') {
    first = { ...clip, duration: frameStart(head, rate) };
    second = { ...clip, id: secondId, duration: frameStart(span.endFrame - k, rate) };
  } else {
    // "Source frames": project time maps to source time through the in point and speed.
    const cut =
      (clip.in ?? 0) + Math.round(((frameStart(k, rate) - frameStart(span.startFrame, rate)) * speedOf(clip)) / 100);
    first = { ...clip, out: cut };
    second = { ...clip, id: secondId, in: cut };
  }
  first = { ...first, fadeOut: 0, crossFadeNext: 0 };
  second = { ...second, fadeIn: 0 };
  if (span.endFrame - k < span.crossFadeFrames) second = { ...second, crossFadeNext: 0 };
  return { first, second, removeIncoming: head < incomingCrossFadeFrames };
}

/**
 * Implements: RULE-04 re-timing of one main-track clip: fades, cross-fade and photo duration move to
 * whole frames at the new rate; nothing goes below its minimum — a too-short video clip extends at its
 * end, else at its start, else (source used whole) slows to the fastest step that reaches the minimum
 * ("for speed, stops", rules.md).
 */
export function retimeClip(clip: Clip, rate: FrameRate, end: Micros | undefined): Clip {
  const snap = (t: Micros) => frameStart(nearestFrame(t, rate), rate);
  const min = minFrames(rate);
  let next: Clip = { ...clip, fadeIn: snap(clip.fadeIn), fadeOut: snap(clip.fadeOut) };
  if (clip.crossFadeNext > 0)
    next = {
      ...next,
      crossFadeNext: frameStart(Math.max(nearestFrame(clip.crossFadeNext, rate), minCrossFadeFrames(rate)), rate),
    };
  if (clip.kind === 'photo')
    return { ...next, duration: frameStart(Math.max(nearestFrame(clip.duration ?? 0, rate), min), rate) };
  if (clipFrames(next, rate) >= min) return next;
  const sourceLast = end ?? clip.out ?? 0;
  const needed = rangeForFrames(min, speedOf(clip), rate);
  const inPoint = clip.in ?? 0;
  if (inPoint + needed <= sourceLast) return { ...next, out: inPoint + needed };
  if (sourceLast - needed >= 0) return { ...next, in: sourceLast - needed, out: sourceLast };
  next = { ...next, in: 0, out: sourceLast };
  let speedPct = speedOf(next);
  while (speedPct > RULE_06.minPct && clipFrames({ ...next, speedPct }, rate) < min) speedPct -= RULE_06.stepPct;
  return { ...next, speedPct };
}

/** Implements: RULE-10 — audio fade in + fade out never exceed the clip; both shrink in proportion. */
export function fitAudioFades(a: AudioClip, rate: FrameRate): AudioClip {
  const len = a.out - a.in;
  if (a.fadeIn + a.fadeOut <= len) return a;
  const fi = framesOf(a.fadeIn, rate);
  const fo = framesOf(a.fadeOut, rate);
  const total = fi + fo;
  const avail = frameIndexAt(len, rate);
  return {
    ...a,
    fadeIn: frameStart(Math.floor((fi * avail) / total), rate),
    fadeOut: frameStart(Math.floor((fo * avail) / total), rate),
  };
}

/**
 * Implements: RULE-04 re-timing of the audio track: starts and fades move to frame starts at the new
 * rate, no clip goes below its minimum (within its source), and where two clips that touched would
 * now overlap the later one moves to the first frame start after the earlier one ends (INV-06;
 * spec question 3). Keeps the array order.
 */
export function retimeAudio(
  clips: readonly AudioClip[],
  rate: FrameRate,
  endOf: (sourceId: string) => Micros | undefined,
): AudioClip[] {
  const snap = (t: Micros) => frameStart(nearestFrame(t, rate), rate);
  const min = minDuration(rate);
  const snapped = clips
    .map((a) => {
      let next: AudioClip = { ...a, start: snap(a.start), fadeIn: snap(a.fadeIn), fadeOut: snap(a.fadeOut) };
      if (next.out - next.in < min) {
        const out = Math.min(endOf(a.sourceId) ?? a.out, next.in + min);
        next = { ...next, out, in: Math.min(next.in, Math.max(0, out - min)) };
      }
      return fitAudioFades(next, rate);
    })
    .sort((x, y) => x.start - y.start);
  const moved = new Map<string, AudioClip>();
  let lastEnd = 0;
  for (const a of snapped) {
    const start = a.start < lastEnd ? frameStart(frameAtOrAfter(lastEnd, rate), rate) : a.start;
    const next = start === a.start ? a : { ...a, start };
    moved.set(a.id, next);
    lastEnd = audioEnd(next);
  }
  return clips.map((a) => moved.get(a.id) ?? a);
}

/**
 * Implements: RULE-12 audio trims — the start or end of an audio clip moved to time t, within its
 * source (`end` unknown: the clip may not grow at its end), never overlapping (INV-06), at least 0.1 s.
 */
export function trimAudioClip(
  a: AudioClip,
  others: readonly AudioClip[],
  edge: 'start' | 'end',
  t: Micros,
  end: Micros | undefined,
  rate: FrameRate,
): AudioClip {
  const clipEnd = audioEnd(a);
  let next: AudioClip;
  if (edge === 'start') {
    const prevEnd = Math.max(0, ...others.filter((x) => x.start < a.start).map(audioEnd));
    const earliest = frameStart(frameAtOrAfter(Math.max(prevEnd, a.start - a.in), rate), rate);
    const latest = frameStart(frameIndexAt(clipEnd - minDuration(rate), rate), rate);
    const start = clamp(t, earliest, Math.max(earliest, latest));
    next = { ...a, start, in: a.in + (start - a.start) };
  } else {
    const nextStart = Math.min(Infinity, ...others.filter((x) => x.start >= clipEnd).map((x) => x.start));
    const sourceLast = Math.max(end ?? a.out, a.out);
    const newEnd = clamp(t, a.start + minDuration(rate), Math.min(nextStart, a.start + (sourceLast - a.in)));
    next = { ...a, out: a.in + (newEnd - a.start) };
  }
  if (next.start === a.start && next.in === a.in && next.out === a.out) return a;
  return fitAudioFades(next, rate);
}

/** RULE-10: the longest audio clip fade, in frames. */
export const maxAudioFadeFrames = (rate: FrameRate): number => secondsToFrames(RULE_10.audioFadeMaxSeconds, rate);
