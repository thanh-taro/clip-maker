// MOD-Core — the audio track: placing a new audio clip and the move rule (RULE-12, D-021, D-027).
// Implements: RULE-12 placing and editing audio clips, INV-06 (never overlapping).
import type { AudioClip } from './project.gen';
import {
  frameAtOrAfter,
  frameIndexAt,
  frameStart,
  minDuration,
  nearestFrame,
  type FrameRate,
  type Micros,
} from './time';

/** An audio clip's end on the timeline: its start plus its source range (no speed for audio clips). */
export const audioEnd = (a: AudioClip): Micros => a.start + (a.out - a.in);
export const audioLength = (a: AudioClip): Micros => a.out - a.in;

/** The audio clips in time order. */
export const byStart = (clips: readonly AudioClip[]): AudioClip[] => clips.slice().sort((a, b) => a.start - b.start);

export interface TrackContext {
  readonly rate: FrameRate;
  /** The project end (µs). */
  readonly projectEnd: Micros;
  /** The main track has no clips. */
  readonly mainEmpty: boolean;
}

/**
 * RULE-12 "Placing on the audio track": the start and length of a new audio clip whose source has
 * `available` µs from its in point, or null when it is refused (COPY-notice.no_audio_room).
 * An audio clip's start is a frame start (rules.md), so moving to another clip's end goes to the
 * first frame start at or after that end.
 */
export function placeNewAudio(
  clips: readonly AudioClip[],
  playhead: Micros,
  available: Micros,
  ctx: TrackContext,
): { start: Micros; length: Micros } | null {
  const sorted = byStart(clips);
  let start = ctx.mainEmpty || playhead >= ctx.projectEnd ? 0 : playhead;
  for (const a of sorted) {
    if (a.start <= start && start < audioEnd(a)) start = frameStart(frameAtOrAfter(audioEnd(a), ctx.rate), ctx.rate);
  }
  if (!ctx.mainEmpty && start >= ctx.projectEnd) return null;
  const next = sorted.find((a) => a.start >= start);
  const end = Math.min(start + available, next ? next.start : Infinity);
  const length = end - start;
  if (length < minDuration(ctx.rate)) return null;
  return { start, length };
}

/**
 * RULE-12 move rule (D-021, D-027): the start, nearest the requested start, of the free time where
 * the clip fits whole, its own original place counting as free; the start must be before the
 * project end (or 0 with an empty main track). Null when no such time exists or the result is the
 * clip's original place (nothing changes, no undo step). Equal distances go to the earlier start.
 * `self` may be a clip not yet on the track (a duplicate), whose original place is then not free.
 */
export function moveTarget(
  clips: readonly AudioClip[],
  self: AudioClip,
  requested: Micros,
  ctx: TrackContext,
  originalPlace: Micros | null = self.start,
): Micros | null {
  const length = audioLength(self);
  const others = byStart(clips.filter((a) => a.id !== self.id));
  const lastStart = ctx.mainEmpty ? 0 : ctx.projectEnd - 1;
  if (lastStart < 0) return null;
  const gaps: [Micros, Micros][] = [];
  let from = 0;
  for (const o of others) {
    gaps.push([from, o.start]);
    from = Math.max(from, audioEnd(o));
  }
  gaps.push([from, Infinity]);
  let best: Micros | null = null;
  for (const [g0, g1] of gaps) {
    const lo = frameAtOrAfter(g0, ctx.rate);
    const hiTime = Math.min(g1 - length, lastStart);
    if (hiTime < 0) continue;
    const hi = frameIndexAt(hiTime, ctx.rate);
    if (lo > hi) continue;
    const k = Math.min(hi, Math.max(lo, nearestFrame(Math.max(0, requested), ctx.rate)));
    const s = frameStart(k, ctx.rate);
    if (best === null || Math.abs(s - requested) < Math.abs(best - requested)) best = s;
    else if (Math.abs(s - requested) === Math.abs(best - requested) && s < best) best = s;
  }
  if (best === null || best === originalPlace) return null;
  return best;
}

/** INV-06: no two audio clips overlap. */
export function audioOverlaps(clips: readonly AudioClip[]): boolean {
  const sorted = byStart(clips);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev && cur && audioEnd(prev) > cur.start) return true;
  }
  return false;
}
