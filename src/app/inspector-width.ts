// MOD-App — the compact inspector's width (CMP-Inspector "compact", style.md "Layouts" compact; build
// question 105, decided by the owner 2026-11-16): on compact layouts (700–999 px) the docked inspector has
// a resize grip on its left edge and no Close. Dragging the grip, or its arrow keys, sets the width from
// `size.inspector` up to 40 % of the tool's width. The width is UI state (not an undo step, RULE-13): it
// stays while the page is open, through selections, the media drawer and layout changes, clamped to the
// tool's current width.
// Implements: CMP-Inspector "compact" (the grip: drag or arrow keys; no Close), NFR-06 (keyboard).
import { signal } from '@preact/signals';

/** The width the user chose with the grip, in CSS pixels (null: `size.inspector`). */
export const inspectorWidth = signal<number | null>(null);

/** CMP-Inspector "compact": up to 40 % of the tool's width. */
export const INSPECTOR_MAX_SHARE = 0.4;
/** One arrow key moves the grip this far (CSS pixels); Shift goes to the limit. */
export const GRIP_STEP = 16;

export interface WidthRange {
  readonly min: number;
  readonly max: number;
}

/** The grip's range on a tool `toolWidth` wide, `min` being `size.inspector`. */
export function inspectorWidthRange(toolWidth: number, min: number): WidthRange {
  return { min, max: Math.max(min, Math.floor(toolWidth * INSPECTOR_MAX_SHARE)) };
}

export const clampWidth = (v: number, r: WidthRange): number => Math.min(r.max, Math.max(r.min, Math.round(v)));

/**
 * The width after a key on the focused grip (it sits on the inspector's left edge): Left and Up widen,
 * Right and Down narrow, by `GRIP_STEP` (Shift: to the limit); Home and End go to the narrowest and widest.
 * Null for any other key.
 */
export function gripKeyWidth(key: string, shift: boolean, width: number, r: WidthRange): number | null {
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      return shift ? r.max : clampWidth(width + GRIP_STEP, r);
    case 'ArrowRight':
    case 'ArrowDown':
      return shift ? r.min : clampWidth(width - GRIP_STEP, r);
    case 'Home':
      return r.min;
    case 'End':
      return r.max;
    default:
      return null;
  }
}
