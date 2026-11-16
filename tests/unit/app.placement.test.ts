// MOD-App — clip placement (F-006): what the Position section and the preview's handles act on, each
// control as one RULE-13 step (Fit/Fill, typed scale and offset, nudges with Shift, Rotate, the flips,
// Reset), a drag or slider movement as one coalesced gesture measured from where it began (back at its
// start: no step, Q104), cut by undo or by an outside edit. The rule maths is MOD-Core's (RULE-07) and
// MOD-Project's `setPlacement` / `resetPlacement`.
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PLACEMENT, frameAspect, type Project } from '../../src/core';
import { EMPTY_HISTORY, edit, history, playhead, project, redo, selection, setAspect, undo } from '../../src/project';
import { selectClip } from '../../src/app/arrange';
import {
  beginPlacementDrag,
  flipClip,
  nudgeClip,
  OFFSET_LIMIT,
  placementShown,
  placementTarget,
  resetClipPlacement,
  rotateClip,
  setPlacementOnce,
} from '../../src/app/placement';
import { S, audio, photo, photoSource, proj, video, videoSource } from '../support/project';

function start(p: Project): void {
  project.value = p;
  history.value = EMPTY_HISTORY;
  selection.value = [];
  playhead.value = 0;
}
const steps = () => history.value.past.length;
const placementOf = (id: string) => project.value.clips.find((c) => c.id === id)!.placement;

describe('F-006 placement in the editor', () => {
  beforeEach(() =>
    start(
      proj({
        clips: [video('A', 4), photo('P', 3), video('B', 2)],
        audioClips: [audio('M', 0, 5)],
      }),
    ),
  );

  it('F-006 Scope a selected video or photo clip has a placement; nothing else does', () => {
    expect(placementTarget.value).toBeNull();
    selectClip('M');
    expect(placementTarget.value).toBeNull();
    selectClip('P');
    expect(placementTarget.value).toMatchObject({ id: 'P', kind: 'photo', placement: DEFAULT_PLACEMENT });
    expect(placementTarget.value?.picture).toEqual({ width: 1200, height: 1600 });
    selectClip('A');
    expect(placementTarget.value).toMatchObject({ id: 'A', kind: 'video', changed: false });
  });

  it('F-006.R1 Fit and Fill are one step each; picking the mode shown makes no step', () => {
    selectClip('A');
    setPlacementOnce('A', { mode: 'fit' });
    expect(steps()).toBe(0);
    setPlacementOnce('A', { mode: 'fill' });
    expect(placementOf('A').mode).toBe('fill');
    expect(steps()).toBe(1);
    expect(placementTarget.value?.changed).toBe(true);
  });

  it('F-006.AC5 F-006.R5 scale 150 % then two nudges right: 150 % with the centre 2 % of the frame width right of centre, three steps', () => {
    selectClip('A');
    expect(setPlacementOnce('A', { scale: 150 }).scale).toBe(150);
    nudgeClip('A', 'right');
    nudgeClip('A', 'right');
    expect(placementOf('A')).toMatchObject({ scale: 150, offsetX: 0.02, offsetY: 0 });
    expect(steps()).toBe(3);
  });

  it('RULE-07 a nudge moves 1 % of the frame, 10 % with Shift, in each direction', () => {
    nudgeClip('A', 'left');
    nudgeClip('A', 'down', true);
    nudgeClip('A', 'up');
    nudgeClip('A', 'right', true);
    expect(placementOf('A')).toMatchObject({ offsetX: 0.09, offsetY: 0.09 });
    for (let i = 0; i < 7; i++) nudgeClip('A', 'left');
    expect(placementOf('A').offsetX).toBe(0.02);
  });

  it('RULE-07 typed scale and offsets clamp to the range (scale 50–400 %, whole percent)', () => {
    expect(setPlacementOnce('A', { scale: 1000 }).scale).toBe(400);
    expect(setPlacementOnce('A', { scale: 12.6 }).scale).toBe(50);
    expect(setPlacementOnce('A', { scale: 133.4 }).scale).toBe(133);
    expect(setPlacementOnce('A', { offsetX: 99 }).offsetX).toBe(OFFSET_LIMIT);
    expect(setPlacementOnce('A', { offsetY: -0.123456 }).offsetY).toBe(-0.1235);
  });

  it('F-006.R3 F-006.AC3 Rotate turns 90° clockwise per step, four steps come round; each is one undo step', () => {
    rotateClip('A');
    expect(placementOf('A').rotation).toBe(90);
    rotateClip('A');
    rotateClip('A');
    rotateClip('A');
    expect(placementOf('A').rotation).toBe(0);
    expect(steps()).toBe(4);
    undo();
    expect(placementOf('A').rotation).toBe(270);
  });

  it('F-006.R3 flips toggle horizontally and vertically, each one step', () => {
    flipClip('A', 'h');
    flipClip('A', 'v');
    expect(placementOf('A')).toMatchObject({ flipH: true, flipV: true });
    flipClip('A', 'h');
    expect(placementOf('A')).toMatchObject({ flipH: false, flipV: true });
    expect(steps()).toBe(3);
  });

  it('F-006.AC4 F-006.R4 a clip at 200 % and moved: Reset makes it Fit, 100 % and centred, as one step; at the defaults Reset makes none', () => {
    setPlacementOnce('A', { mode: 'fill', scale: 200 });
    nudgeClip('A', 'right', true);
    rotateClip('A');
    flipClip('A', 'v');
    const before = steps();
    resetClipPlacement('A');
    expect(placementOf('A')).toEqual(DEFAULT_PLACEMENT);
    expect(steps()).toBe(before + 1);
    resetClipPlacement('A');
    expect(steps()).toBe(before + 1);
  });

  it('F-006.AC6 RULE-04 with Original aspect, rotating a sideways first clip turns the frame to its new shape', () => {
    start(
      proj({
        clips: [video('A', 4)],
        sources: [videoSource('src-A', 4, { width: 1920, height: 1080 })],
      }),
    );
    expect(frameAspect(project.value)).toBeCloseTo(16 / 9, 6);
    rotateClip('A');
    expect(frameAspect(project.value)).toBeCloseTo(9 / 16, 6);
    undo();
    expect(frameAspect(project.value)).toBeCloseTo(16 / 9, 6);
    // A fixed aspect keeps its shape.
    edit((p) => setAspect(p, '1:1'));
    rotateClip('A');
    expect(frameAspect(project.value)).toBe(1);
  });

  it('F-006 Edge cases a clip moved fully outside the frame is allowed, with no message', () => {
    setPlacementOnce('A', { offsetX: 2, offsetY: -1.5 });
    expect(placementOf('A')).toMatchObject({ offsetX: 2, offsetY: -1.5 });
  });

  it('RULE-13 F-006.R2 a drag through many positions and scales is one step; one undo returns to before it', () => {
    selectClip('A');
    const before = project.value;
    const drag = beginPlacementDrag('A', () => undefined);
    for (let i = 1; i <= 20; i++) drag.set({ offsetX: i / 100, scale: 100 + i });
    drag.end();
    expect(steps()).toBe(1);
    expect(placementOf('A')).toMatchObject({ offsetX: 0.2, scale: 120 });
    undo();
    expect(project.value).toBe(before);
    redo();
    expect(placementOf('A').scale).toBe(120);
  });

  it('Q104 RULE-13 a drag or slider movement back to where it began leaves no step and keeps redo', () => {
    setPlacementOnce('A', { scale: 150 });
    undo();
    expect(history.value.future.length).toBe(1);
    const before = project.value;
    const drag = beginPlacementDrag('A', () => undefined);
    drag.set({ scale: 180 });
    drag.set({ scale: 100 });
    drag.end();
    expect(project.value).toBe(before);
    expect(steps()).toBe(0);
    expect(history.value.future.length).toBe(1);
  });

  it('F-006.R2 a cancelled drag (pointercancel, Esc) puts the clip back and leaves no step', () => {
    const before = project.value;
    const drag = beginPlacementDrag('A', () => undefined);
    drag.set({ offsetX: 0.3, offsetY: 0.1 });
    expect(placementOf('A').offsetX).toBe(0.3);
    drag.cancel();
    expect(project.value).toBe(before);
    expect(steps()).toBe(0);
    expect(drag.active).toBe(false);
  });

  it('F-014 an undo or an outside edit during a drag cuts it: onCut runs and later moves are ignored', () => {
    setPlacementOnce('A', { scale: 120 });
    let cut = 0;
    const drag = beginPlacementDrag('A', () => cut++);
    drag.set({ scale: 200 });
    undo();
    expect(cut).toBe(1);
    expect(drag.active).toBe(false);
    drag.set({ scale: 300 });
    expect(placementOf('A').scale).toBe(120);
    // An outside edit (another control) cuts a new drag too, so the drag never writes over it.
    const again = beginPlacementDrag('A', () => cut++);
    again.set({ offsetX: 0.5 });
    flipClip('A', 'h');
    expect(cut).toBe(2);
    again.set({ offsetX: 0.7 });
    expect(placementOf('A')).toMatchObject({ offsetX: 0.5, flipH: true });
  });

  it('CMP-Preview "clip selected" the handles show while the playhead is within the selected clip', () => {
    expect(placementShown.value).toBe(false);
    selectClip('P');
    playhead.value = 1 * S;
    expect(placementShown.value).toBe(false);
    playhead.value = 4 * S;
    expect(placementShown.value).toBe(true);
    playhead.value = Math.round(6.9 * S);
    expect(placementShown.value).toBe(true);
    playhead.value = 7 * S;
    expect(placementShown.value).toBe(false);
  });

  it('F-006 a photo source with no size yet has no picture to place handles around', () => {
    start(proj({ clips: [photo('Q', 2)], sources: [photoSource('src-Q', { width: 0, height: 0 })] }));
    selectClip('Q');
    expect(placementTarget.value?.picture).toBeNull();
  });
});
