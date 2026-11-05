// MOD-Core — text layer rule maths (RULE-11, RULE-10 text fade).
// Implements: RULE-11 limits, defaults and timing; RULE-10 text fade length.
import type { TextLayer } from './project.gen';
import { RULE_10, RULE_11 } from './limits';
import { halfFrames, minFrames, pickedFrames, secondsToFrames, type FrameRate } from './time';

/** RULE-11 defaults for a new layer (content and times are set by the caller). */
export const TEXT_DEFAULTS = Object.freeze({
  typeface: 'sans',
  size: RULE_11.defaultSize,
  colour: 'white',
  style: 'outline',
  align: 'centre',
  x: RULE_11.defaultX,
  y: RULE_11.defaultY,
  // Implements: RULE-11 — a new layer's text fade (RULE-10) is off.
  fade: false,
} as const satisfies Partial<TextLayer>);

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** User-perceived characters (grapheme clusters) of a text. */
export const graphemes = (text: string): string[] => Array.from(segmenter.segment(text), (s) => s.segment);
export const characterCount = (text: string): number => graphemes(text.normalize('NFC')).length;

/**
 * RULE-11: text is kept in composed form (NFC) and at most 500 user-perceived characters;
 * shortening never splits a character.
 */
export function clampText(text: string, max: number = RULE_11.maxCharacters): string {
  const nfc = text.normalize('NFC');
  const parts = graphemes(nfc);
  return parts.length <= max ? nfc : parts.slice(0, max).join('');
}

/** RULE-11 empty text: only whitespace (or nothing). */
export const isBlankText = (text: string): boolean => text.trim() === '';

/**
 * RULE-11 "Time": a new layer starts at the playhead and lasts 3 s; past the project end it ends at
 * the end and starts earlier if needed to stay at least 0.1 s long; in an empty project 0 to 3 s.
 * Frames in, frames out.
 */
export function newTextFrames(playheadFrame: number, projectFrames: number, rate: FrameRate): [number, number] {
  const length = secondsToFrames(RULE_11.defaultSeconds, rate);
  if (projectFrames === 0) return [0, length];
  let start = Math.min(playheadFrame, projectFrames);
  let end = start + length;
  if (end > projectFrames) {
    end = projectFrames;
    start = Math.max(0, Math.min(start, end - minFrames(rate)));
  }
  return [start, end];
}

/** RULE-10 text fade: 0.3 s in and out (as whole frames), or half the layer's length each when shorter. */
export function textFadeFrames(layerFrames: number, rate: FrameRate): number {
  return Math.min(pickedFrames(RULE_10.textFadeTenths, rate), halfFrames(layerFrames));
}
