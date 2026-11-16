// MOD-Preview — on-preview placement of the selected clip (F-006.R2, CMP-Preview "clip selected",
// RULE-21 preview drag and pinch): where the clip and its eight handles sit over the preview, a move
// measured from where the drag began with RULE-07's centre snap, and the scale a handle drag or a pinch
// asks for. Pure geometry in CSS pixels of the shown frame; the rule maths is MOD-Core's (placedRect,
// RULE_07), the edit MOD-Project's `setPlacement` (through MOD-App's drag gesture).
// Implements: F-006.R2 (scale and move directly in the preview, snapping to the frame centre), RULE-07
// (*Position*: fractions of the frame; *Snapping*: within 8 screen pixels; *Scale*: 50–400 % in 1 % steps),
// RULE-21 (*Preview*: dragging moves the selected clip, pinching scales it).
import { placedRect, RULE_07, type Placement } from '../core';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** A clip's drawn box: its centre and size (the picture as displayed, after its rotation). */
export interface Rect {
  readonly cx: number;
  readonly cy: number;
  readonly width: number;
  readonly height: number;
}

export type Point = readonly [x: number, y: number];

/** CMP-Preview "clip selected": the eight placement handles, corners and edge middles. */
export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Offsets are kept to 1/10 000 of the frame (finer than a pixel of any export), so nudges add exactly. */
export const roundOffset = (v: number): number => Math.round(v * 10_000) / 10_000 || 0;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** The clip's box over a frame shown at `frame` CSS pixels (`picture`: the source as displayed). */
export const screenRect = (frame: Size, picture: Size, p: Placement): Rect =>
  placedRect(frame.width, frame.height, picture.width, picture.height, p);

/** The eight handle points around a box. */
export function handlePoints(r: Rect): Record<Handle, Point> {
  const l = r.cx - r.width / 2;
  const t = r.cy - r.height / 2;
  const rr = r.cx + r.width / 2;
  const b = r.cy + r.height / 2;
  return {
    nw: [l, t],
    n: [r.cx, t],
    ne: [rr, t],
    e: [rr, r.cy],
    se: [rr, b],
    s: [r.cx, b],
    sw: [l, b],
    w: [l, r.cy],
  };
}

export interface Moved {
  readonly offsetX: number;
  readonly offsetY: number;
  /** The centre snapped to the frame's vertical / horizontal centre line (a guide shows). */
  readonly snapX: boolean;
  readonly snapY: boolean;
}

/**
 * A move of (dx, dy) CSS pixels from where the drag began (`start`). With snapping on, a centre within
 * `snapPx` screen pixels of a centre line lands on it (RULE-07). Back where it began is exactly the
 * starting offset, with no snap, so the drag leaves no step (Q104).
 */
export function moveFrom(
  start: Placement,
  dx: number,
  dy: number,
  frame: Size,
  snapping: boolean,
  snapPx: number = RULE_07.snapPx,
): Moved {
  if (dx === 0 && dy === 0) return { offsetX: start.offsetX, offsetY: start.offsetY, snapX: false, snapY: false };
  const x = start.offsetX + dx / frame.width;
  const y = start.offsetY + dy / frame.height;
  const snapX = snapping && Math.abs(x * frame.width) <= snapPx;
  const snapY = snapping && Math.abs(y * frame.height) <= snapPx;
  return { offsetX: snapX ? 0 : roundOffset(x), offsetY: snapY ? 0 : roundOffset(y), snapX, snapY };
}

const clampScale = (v: number): number => clamp(Math.round(v), RULE_07.minScale, RULE_07.maxScale);

/**
 * The scale a handle drag asks for: the starting scale times how much farther from the clip's centre the
 * pointer is than where it began — the straight distance for a corner, the distance along the edge's
 * axis for an edge handle. 50–400 % in whole percent (RULE-07).
 */
export function scaleFrom(startScale: number, handle: Handle, centre: Point, from: Point, to: Point): number {
  if (from[0] === to[0] && from[1] === to[1]) return startScale;
  const axis = handle === 'e' || handle === 'w' ? 0 : handle === 'n' || handle === 's' ? 1 : null;
  const dist = (p: Point): number =>
    axis === null ? Math.hypot(p[0] - centre[0], p[1] - centre[1]) : Math.abs(p[axis] - centre[axis]);
  const d0 = dist(from);
  if (d0 < 1) return startScale;
  return clampScale((startScale * dist(to)) / d0);
}

/** RULE-21: a pinch scales by the change in the distance between the two fingers. */
export function pinchScale(startScale: number, startDistance: number, distance: number): number {
  if (startDistance < 1) return startScale;
  return clampScale((startScale * distance) / startDistance);
}
