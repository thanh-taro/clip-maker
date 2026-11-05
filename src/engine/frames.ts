// MOD-Engine — pure frame-selection and decoder-scheduling rules (ADR-0009 outcome rules 1–6, promoted
// from SP-compositor / SP-mem-hdr `DecoderSlot`), separated from WebCodecs so they are property-tested.
// Implements: rules.md "Source frames" (the frame whose display interval [ts, next ts) contains the
// source time), F-002.R1/R3, NFR-03 (seek strategy), NFR-05 (bounded frames per decoder).
import type { Micros } from '../core';

/** Frame starts are floored to µs; the index lookup adds 2 µs (ADR-0009 outcome rule 1). */
export const EPSILON_US = 2;
/** Packets fed ahead of the target per decoder (outcome rule 3). */
export const FEED_AHEAD = 12;
/** Decoded frames held per decoder (outcome rule 3 / item 7). */
export const MAX_FRAMES = 12;
/** A coarse first paint is worth it when the exact frame is this many frames past the keyframe. */
export const COARSE_AFTER_FRAMES = 4;

export interface Timed {
  readonly timestamp: number;
}

/**
 * The decoded frame presented at `want` (the presentation time the container index gives for the
 * source time, `getPacket(t + 2 µs)`); never chosen from packet durations. A negative `want` (the
 * source time falls in a frame an edit list starts before 0) means the first frame at or after 0.
 */
export function pickFrame<F extends Timed>(frames: readonly F[], want: Micros): F | null {
  if (want < 0) return frames.find((f) => f.timestamp >= 0) ?? null;
  for (const f of frames) if (Math.abs(f.timestamp - want) <= EPSILON_US) return f;
  return null;
}

/** Slow playback (outcome rule 6): the newest decoded frame at or before `want`, else the oldest. */
export function newestAtOrBefore<F extends Timed>(frames: readonly F[], want: Micros): F | null {
  let best: F | null = null;
  for (const f of frames) if (f.timestamp <= want + EPSILON_US) best = f;
  return best ?? frames[0] ?? null;
}

/** Where a decoded frame goes in the presentation-ordered list. */
export function insertionIndex(frames: readonly Timed[], ts: number): number {
  let i = frames.length;
  while (i > 0 && frames[i - 1]!.timestamp > ts) i--;
  return i;
}

/**
 * Which frame to close when the list is over `max` (outcome rule 3): a frame wholly behind the target
 * first (the next one is also at or before it), else the one farthest ahead. Never the pinned one.
 */
export function evictionIndex(frames: readonly Timed[], target: Micros, pinned: Timed | null): number {
  for (let i = 0; i + 1 < frames.length; i++) {
    if (frames[i + 1]!.timestamp > target + EPSILON_US) break;
    if (frames[i] !== pinned) return i;
  }
  for (let i = frames.length - 1; i >= 0; i--) if (frames[i] !== pinned) return i;
  return -1;
}

export type FrameMode = 'exact' | 'play';

export interface DecoderState {
  readonly configured: boolean;
  /** A keyframe is needed (fresh decoder, after a flush or an error). */
  readonly needKey: boolean;
  /** Presentation time of the last packet fed, µs (−∞ after a restart). */
  readonly lastFedTs: number;
  /** Largest presentation time output so far, µs. */
  readonly maxOutTs: number;
  /** More packets remain to feed. */
  readonly hasNext: boolean;
  /** Presentation time of the next packet to feed, µs (+∞ when none). */
  readonly nextTs: number;
}

/**
 * Implements: ADR-0009 outcome rules 2, 4 and 6 — restart at the keyframe `keyTs` (and drop open-GOP
 * leading pictures) or decode forward to `want`? Going back always restarts. While playing, a target
 * still ahead of the decoder never restarts: decoding forward and showing the newest frame keeps
 * slow sources moving (outcome rule 6). A seek restarts when the target's keyframe lies beyond the
 * next packet to feed.
 */
export function needsRestart(s: DecoderState, want: Micros, keyTs: Micros, mode: FrameMode): boolean {
  if (!s.configured || s.needKey) return true;
  if (want <= s.maxOutTs) return true;
  if (mode === 'play') return false;
  // The target's keyframe lies past the next packet: decoding forward would decode a whole gap.
  if (s.hasNext && keyTs > s.nextTs) return true;
  return !s.hasNext && want > s.lastFedTs;
}

/** Open GOP (outcome rule 2): after a restart at `keyTs`, packets presented before it are skipped. */
export function isLeadingPicture(packetTs: Micros, keyTs: Micros): boolean {
  return packetTs < keyTs;
}

/**
 * Keep feeding? Up to FEED_AHEAD packets past the target, with the decoder's queue bounded and never
 * more frames at or ahead of the target (decoded or still in the decoder) than the slot holds — so a
 * frame about to be shown is never evicted for one further ahead.
 */
export function wantsFeed(
  lastFedTs: number,
  want: Micros,
  frameUs: number,
  queue: number,
  ahead = 0,
  max = MAX_FRAMES,
): boolean {
  return lastFedTs < want + FEED_AHEAD * frameUs && queue < 16 && ahead < max;
}

/**
 * Decoder slots for the sources a plan needs (ADR-0009 outcome rule 5): a slot already bound to the
 * source is kept; otherwise a new slot while under `cap`, else the least recently used slot not
 * needed now. Returns one slot index per wanted source (an index ≥ bound.length means "new slot").
 */
export function assignSlots(
  bound: readonly (string | null)[],
  lastUsed: readonly number[],
  wanted: readonly string[],
  cap: number,
): number[] {
  const taken = new Set<number>();
  const out: number[] = [];
  let created = bound.length;
  for (const id of wanted) {
    let i = bound.findIndex((b, j) => b === id && !taken.has(j));
    if (i < 0 && created < cap) i = created++;
    if (i < 0) {
      const free = bound
        .map((b, j) => ({ b, j }))
        .filter(({ b, j }) => !taken.has(j) && !(b !== null && wanted.includes(b)))
        .sort((x, y) => (lastUsed[x.j] ?? 0) - (lastUsed[y.j] ?? 0));
      i = free[0]?.j ?? bound.findIndex((_, j) => !taken.has(j));
    }
    taken.add(i);
    out.push(i);
  }
  return out;
}
