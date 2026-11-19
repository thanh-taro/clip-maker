// MOD-Preview — on-preview placement of the selected text layer (F-010.R3, CMP-Preview "text selected,
// moving", RULE-21 preview drag and pinch): a move measured from where the drag began, with RULE-11's
// snapping (the block's centre to the frame's centre lines, its nearest edge to a safe margin, within
// 8 screen pixels while snapping is on), and the size a handle drag or a pinch asks for. Pure geometry in
// CSS pixels of the shown frame; MOD-App turns the pointer input into one MOD-Project gesture per drag.
// Implements: F-010.R3, F-010.AC3, RULE-11 (*Position*, *Size* 2–20 %), RULE-21 (*Preview*).
import { RULE_11 } from '../core';
import type { Point, Size } from './placement';

export interface TextMoved {
  /** The block's centre, fractions of the frame from its top-left (RULE-11 *Position*). */
  readonly x: number;
  readonly y: number;
  /** The line the centre or an edge snapped to on each axis (a fraction of the frame), or null. */
  readonly snapX: number | null;
  readonly snapY: number | null;
}

const round = (v: number): number => Math.round(v * 10_000) / 10_000 || 0;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * The snap on one axis: `c` the block's centre and `half` its half size, all in screen pixels along a
 * frame of `length`. The candidates are the centre on the centre line and each edge on its safe margin;
 * the closest within `snapPx` wins. Returns the snapped centre and the line, or null.
 */
function snapAxis(c: number, half: number, length: number, snapPx: number): { c: number; line: number } | null {
  const m = RULE_11.safeMargin * length;
  const candidates = [
    { d: length / 2 - c, line: 0.5 },
    { d: m - (c - half), line: RULE_11.safeMargin },
    { d: length - m - (c + half), line: 1 - RULE_11.safeMargin },
  ];
  let best: { d: number; line: number } | null = null;
  for (const k of candidates) if (Math.abs(k.d) <= snapPx && (!best || Math.abs(k.d) < Math.abs(best.d))) best = k;
  return best ? { c: c + best.d, line: best.line } : null;
}

/**
 * Implements: RULE-11 *Position* and snapping — a move of (dx, dy) CSS pixels from the layer's starting
 * centre (`start`, fractions) over a frame shown at `frame` CSS pixels, for a block of `block` CSS pixels.
 * Back where it began is exactly the start, with no snap, so the drag leaves no step (Q104). The centre
 * stays within the frame.
 */
export function moveText(
  start: { readonly x: number; readonly y: number },
  dx: number,
  dy: number,
  frame: Size,
  block: Size,
  snapping: boolean,
  snapPx: number = RULE_11.snapPx,
): TextMoved {
  if (dx === 0 && dy === 0) return { x: start.x, y: start.y, snapX: null, snapY: null };
  let cx = start.x * frame.width + dx;
  let cy = start.y * frame.height + dy;
  const sx = snapping ? snapAxis(cx, block.width / 2, frame.width, snapPx) : null;
  const sy = snapping ? snapAxis(cy, block.height / 2, frame.height, snapPx) : null;
  if (sx) cx = sx.c;
  if (sy) cy = sy.c;
  return {
    x: round(clamp(cx / frame.width, 0, 1)),
    y: round(clamp(cy / frame.height, 0, 1)),
    snapX: sx?.line ?? null,
    snapY: sy?.line ?? null,
  };
}

/** RULE-11 *Size*: 2 % to 20 % of `s`, in whole percent (as the inspector's slider and field). */
export const clampTextSize = (v: number): number => clamp(Math.round(v), RULE_11.minSize, RULE_11.maxSize);

/**
 * The size a handle drag asks for: the starting size times how much farther from the block's centre the
 * pointer is than where it began (RULE-11 *Size*).
 */
export function textSizeFrom(startSize: number, centre: Point, from: Point, to: Point): number {
  if (from[0] === to[0] && from[1] === to[1]) return startSize;
  const d0 = Math.hypot(from[0] - centre[0], from[1] - centre[1]);
  if (d0 < 1) return startSize;
  return clampTextSize((startSize * Math.hypot(to[0] - centre[0], to[1] - centre[1])) / d0);
}

/** RULE-21: a pinch scales the text size by the change in the distance between the two fingers. */
export function pinchTextSize(startSize: number, startDistance: number, distance: number): number {
  if (startDistance < 1) return startSize;
  return clampTextSize((startSize * distance) / startDistance);
}
