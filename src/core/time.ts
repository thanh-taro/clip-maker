// MOD-Core — integer-microsecond time and the "Frame times" conventions of rules.md.
// Implements: rules.md Conventions "Frame times", RULE-04 (rates), RULE-05 (minimum length).
// Every project-timeline time is a frame start; durations are whole frames stored as floor(n·1e6/rate).

/** Integer microseconds: every time in the project (project.schema.json). */
export type Micros = number;
/** A project frame rate (RULE-04). */
export type FrameRate = 24 | 25 | 30 | 60;

export const MICROS_PER_SECOND = 1_000_000;

/** Frame k starts at floor(k × 1,000,000 ÷ rate) µs. Also how n frames of duration are stored. */
export function frameStart(k: number, rate: FrameRate): Micros {
  return Math.floor((k * MICROS_PER_SECOND) / rate);
}

/** The frame count of a stored duration: round(d × rate ÷ 1,000,000). */
export function framesOf(d: Micros, rate: FrameRate): number {
  return Math.round((d * rate) / MICROS_PER_SECOND);
}

/** The index of the frame whose interval [start k, start k+1) contains t (t ≥ 0). */
export function frameIndexAt(t: Micros, rate: FrameRate): number {
  let k = Math.floor((t * rate) / MICROS_PER_SECOND);
  while (frameStart(k + 1, rate) <= t) k++;
  while (k > 0 && frameStart(k, rate) > t) k--;
  return k;
}

/** The nearest frame index to t; exactly halfway goes to the earlier frame (rules.md). */
export function nearestFrame(t: Micros, rate: FrameRate): number {
  if (t <= 0) return 0;
  const k = frameIndexAt(t, rate);
  const before = t - frameStart(k, rate);
  const after = frameStart(k + 1, rate) - t;
  return after < before ? k + 1 : k;
}

/** A time the user enters goes to the nearest frame start; exactly halfway goes to the earlier one. */
export function snapToFrame(t: Micros, rate: FrameRate): Micros {
  return frameStart(nearestFrame(t, rate), rate);
}

/** The first frame index whose start is at or after t. */
export function frameAtOrAfter(t: Micros, rate: FrameRate): number {
  const k = frameIndexAt(Math.max(0, t), rate);
  return frameStart(k, rate) >= t ? k : k + 1;
}

/** Minimum length in frames for a minimum given in tenths of a second: rounds **up** (rules.md). */
export function minFramesForTenths(tenths: number, rate: FrameRate): number {
  return Math.ceil((tenths * rate) / 10);
}

/** RULE-05: the 0.1 s minimum of every clip, text layer, audio clip and cross-fade, in whole frames. */
export function minFrames(rate: FrameRate): number {
  return minFramesForTenths(1, rate);
}

/** RULE-05: the 0.1 s minimum as a stored duration. */
export function minDuration(rate: FrameRate): Micros {
  return frameStart(minFrames(rate), rate);
}

/**
 * A duration picked in 0.1 s steps → the nearest whole number of frames, exactly halfway rounding up;
 * below `minimum` frames the minimum is used (rules.md "Frame times").
 */
export function pickedFrames(tenths: number, rate: FrameRate, minimum = 0): number {
  // n = round_half_up(tenths × rate ÷ 10), in integers.
  const n = Math.floor((2 * tenths * rate + 10) / 20);
  return Math.max(n, minimum);
}

/** "Half" of a length in frames rounds down (rules.md). */
export function halfFrames(frames: number): number {
  return Math.floor(frames / 2);
}

/** Whole seconds as frames (exact for every RULE-04 rate). */
export function secondsToFrames(seconds: number, rate: FrameRate): number {
  return seconds * rate;
}
