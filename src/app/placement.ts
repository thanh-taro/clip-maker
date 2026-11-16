// MOD-App — clip placement (F-006): what CMP-Inspector's Position section, the phone Edit sheet's
// Position and Scale rows and the preview's placement handles act on, and the actions behind them. The
// rule maths is MOD-Core's (RULE-07: clampPlacement, rotateClockwise, placedRect) and MOD-Project's
// `setPlacement` / `resetPlacement`; MOD-Preview has the on-preview geometry. Each control is one RULE-13
// step; one drag in the preview or one Scale slider movement is one step (F-014 `beginGesture(onCut)`),
// measured from where it began, so back at its start it leaves none (Q104).
// Implements: F-006.R1 (Fit or Fill), F-006.R2 (scale and move, one step per drag), F-006.R3 (rotate in
// 90° clockwise steps, flip horizontally or vertically, as displayed — RULE-07), F-006.R4 (reset),
// F-006.R5 (scale and position by visible controls: typed values and nudges of 1 %, 10 % with Shift).
import { computed } from '@preact/signals';
import {
  clampPlacement,
  DEFAULT_PLACEMENT,
  frameIndexAt,
  layoutOf,
  rotateClockwise,
  RULE_07,
  type Placement,
  type Project,
} from '../core';
import { roundOffset, type Size } from '../preview';
import { beginGesture, edit, playhead, project, resetPlacement, setPlacement } from '../project';
import { selectedClip } from './arrange';

/**
 * How far the clip's centre may be from the frame's centre, in frame widths / heights (±1000 %). RULE-07
 * sets no limit (the clip may move fully outside the frame); the fields need a range (build question 132).
 */
export const OFFSET_LIMIT = 10;

const samePlacement = (a: Placement, b: Placement): boolean => JSON.stringify(a) === JSON.stringify(b);

/** RULE-07 ranges, with offsets kept to 1/10 000 of the frame so nudges add exactly. */
function normalise(p: Placement): Placement {
  const c = clampPlacement(p);
  const offsetX = roundOffset(Math.min(OFFSET_LIMIT, Math.max(-OFFSET_LIMIT, c.offsetX)));
  const offsetY = roundOffset(Math.min(OFFSET_LIMIT, Math.max(-OFFSET_LIMIT, c.offsetY)));
  return offsetX === c.offsetX && offsetY === c.offsetY ? c : { ...c, offsetX, offsetY };
}

export interface PlacementTarget {
  readonly id: string;
  readonly kind: 'video' | 'photo';
  readonly placement: Placement;
  /** Not at RULE-07's defaults (Reset is available; numbers read in the text colour). */
  readonly changed: boolean;
  /** The source as displayed (its stored rotation applied), or null while its size is unknown. */
  readonly picture: Size | null;
}

/** The selected video or photo clip's placement, or null (audio clips and text layers have none). */
export const placementTarget = computed<PlacementTarget | null>(() => {
  const clip = selectedClip.value;
  if (!clip) return null;
  const source = project.value.sources.find((s) => s.id === clip.sourceId);
  const picture = source?.width && source.height ? { width: source.width, height: source.height } : null;
  return {
    id: clip.id,
    kind: clip.kind,
    placement: clip.placement,
    changed: !samePlacement(clip.placement, DEFAULT_PLACEMENT),
    picture,
  };
});

/**
 * CMP-Preview "clip selected": the outline and handles show while the selected clip is the one the
 * preview shows, i.e. the playhead is within it (build question 132). The view also hides them while
 * playing.
 */
export const placementShown = computed<boolean>(() => {
  const clip = selectedClip.value;
  if (!clip) return false;
  const p = project.value;
  const span = layoutOf(p).spans[p.clips.indexOf(clip)];
  if (!span) return false;
  const k = frameIndexAt(playhead.value, p.frame.frameRate);
  return span.startFrame <= k && k < span.endFrame;
});

const placementOf = (p: Project, id: string): Placement | null => p.clips.find((c) => c.id === id)?.placement ?? null;

/** The project with clip `id`'s placement changed as asked (normalised), or `p` itself when nothing changes. */
function placed(p: Project, id: string, change: Partial<Placement>) {
  const now = placementOf(p, id);
  if (!now) return { project: p, notices: [], changed: [] };
  return setPlacement(p, id, normalise({ ...now, ...change }));
}

/** One control (a mode pick, a typed value, a slider key): one step. Returns the placement now in effect. */
export function setPlacementOnce(id: string, change: Partial<Placement>): Placement {
  edit((p) => placed(p, id, change));
  return placementOf(project.peek(), id) ?? DEFAULT_PLACEMENT;
}

export type NudgeDirection = 'left' | 'right' | 'up' | 'down';

/** RULE-07 *Nudge*: 1 % of the frame (10 % with Shift) in one direction; one step. */
export function nudgeClip(id: string, direction: NudgeDirection, big = false): void {
  const now = placementOf(project.peek(), id);
  if (!now) return;
  const d = big ? RULE_07.nudgeShift : RULE_07.nudge;
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  setPlacementOnce(
    id,
    horizontal ? { offsetX: roundOffset(now.offsetX + sign * d) } : { offsetY: roundOffset(now.offsetY + sign * d) },
  );
}

/** RULE-07 *Rotate*: one 90° clockwise step (with Original aspect the frame follows, RULE-04). */
export function rotateClip(id: string): void {
  const now = placementOf(project.peek(), id);
  if (now) setPlacementOnce(id, { rotation: rotateClockwise(now.rotation) });
}

/** RULE-07 *Flip*: mirror the picture as displayed, horizontally (`h`) or vertically (`v`). */
export function flipClip(id: string, axis: 'h' | 'v'): void {
  const now = placementOf(project.peek(), id);
  if (now) setPlacementOnce(id, axis === 'h' ? { flipH: !now.flipH } : { flipV: !now.flipV });
}

/** RULE-07 *Reset*: every placement setting back to default; one step (none when already there). */
export function resetClipPlacement(id: string): void {
  edit((p) => resetPlacement(p, id));
}

/** One drag in the preview or one Scale slider movement (F-014 gesture). */
export interface PlacementDrag {
  /** The placement asked for now, as a change from where the drag began. */
  set(change: Partial<Placement>): void;
  /** The drag is over: the step is complete. */
  end(): void;
  /** Esc or a cancelled pointer: the clip goes back to where it was, leaving no step. */
  cancel(): void;
  /** False once ended, or once undo, redo, New project or another edit cut it. */
  readonly active: boolean;
}

/**
 * Implements: RULE-13 (one drag is one step), Q104 (a value back at the start is no change). Each move
 * places the clip on the project as it was when the drag began, so a drag back to the start puts the
 * project back exactly and leaves no step. `onCut` runs when undo, redo, New project or an edit outside
 * the drag cut it.
 */
export function beginPlacementDrag(id: string, onCut: () => void): PlacementDrag {
  const base = project.peek();
  const origin = placementOf(base, id) ?? DEFAULT_PLACEMENT;
  let ended = false;
  const gesture = beginGesture(() => {
    ended = true;
    gesture.end();
    onCut();
  });
  const set = (change: Partial<Placement>): void => {
    if (ended || !gesture.active) return;
    gesture.edit(() =>
      samePlacement(normalise({ ...origin, ...change }), origin)
        ? { project: base, notices: [], changed: [] }
        : placed(base, id, change),
    );
  };
  return {
    set,
    end() {
      if (ended) return;
      ended = true;
      gesture.end();
    },
    cancel() {
      if (ended) return;
      set({});
      ended = true;
      gesture.end();
    },
    get active() {
      return !ended && gesture.active;
    },
  };
}
