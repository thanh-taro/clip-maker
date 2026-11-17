// MOD-App — looks (F-008): choosing a look (or None) as one RULE-13 step that keeps the adjustments, previews
// without a step, the intensity (typed values and keys one step each, one slider movement one step measured
// from where it began, Q104), the gallery's group, and the RULE-09 thumbnail frame the gallery asks for.
import { beforeEach, describe, expect, it } from 'vitest';
import { LOOK_IDS, LOOKS, type Look, type Project } from '../../src/core';
import {
  edit,
  EMPTY_HISTORY,
  history,
  playhead,
  project,
  redo,
  selection,
  setAdjustments,
  undo,
} from '../../src/project';
import { selectClip } from '../../src/app/arrange';
import {
  beginIntensityDrag,
  chooseLook,
  endLookPreview,
  galleryGroup,
  groupLooks,
  lookTarget,
  previewLook,
  previewing,
  setIntensityOnce,
  shownGroup,
  thumbnailFrame,
} from '../../src/app/looks';
import { audio, photo, proj, S, video } from '../support/project';

function start(p: Project): void {
  project.value = p;
  history.value = EMPTY_HISTORY;
  selection.value = [];
  playhead.value = 0;
  galleryGroup.value = null;
  endLookPreview();
}
const steps = () => history.value.past.length;
const clip = (id: string) => project.value.clips.find((c) => c.id === id)!;
const lookOf = (id: string): Look => clip(id).look;

describe('F-008 looks in the editor', () => {
  beforeEach(() =>
    start(proj({ clips: [video('A', 4), photo('P', 3), video('B', 2)], audioClips: [audio('M', 0, 5)] })),
  );

  it('RULE-09 F-008.R1 the gallery acts on the selected video or photo clip only; its groups list four looks each', () => {
    expect(lookTarget.value).toBeNull();
    selectClip('P');
    expect(lookTarget.value).toMatchObject({ id: 'P', look: null });
    selection.value = ['M'];
    expect(lookTarget.value).toBeNull();
    expect(groupLooks('Film')).toEqual(['film-faded', 'film-retro', 'film-pastel', 'film-instant']);
    for (const id of LOOK_IDS) expect(groupLooks(LOOKS[id].group)).toContain(id);
  });

  it('F-008.R2 RULE-09 RULE-13 choosing a look is one undo step at intensity 100; choosing it again is no step', () => {
    selectClip('A');
    chooseLook('A', 'film-retro');
    expect(lookOf('A')).toEqual({ id: 'film-retro', intensity: 100 });
    expect(steps()).toBe(1);
    chooseLook('A', 'film-retro');
    expect(steps()).toBe(1);
    undo();
    expect(lookOf('A')).toBeNull();
    redo();
    expect(lookOf('A')).toEqual({ id: 'film-retro', intensity: 100 });
  });

  it('F-008.AC7 RULE-13 three looks chosen in turn: the last is applied and three undo steps exist', () => {
    selectClip('A');
    chooseLook('A', 'natural-warm');
    chooseLook('A', 'cine-night');
    chooseLook('A', 'bw-sepia');
    expect(lookOf('A')).toEqual({ id: 'bw-sepia', intensity: 100 });
    expect(steps()).toBe(3);
    undo();
    expect(lookOf('A')!.id).toBe('cine-night');
  });

  it('F-008.AC4 F-008.R4 choosing a look keeps the adjustments (Brightness +30 stays)', () => {
    edit((p) => setAdjustments(p, 'A', { brightness: 30 }));
    selectClip('A');
    chooseLook('A', 'cine-golden');
    expect(clip('A').adjustments).toEqual({ brightness: 30 });
    expect(lookOf('A')!.id).toBe('cine-golden');
  });

  it('F-008.AC5 F-008.R5 picking None removes the look, as one step; None again is no step', () => {
    selectClip('A');
    chooseLook('A', 'film-faded');
    chooseLook('A', null);
    expect(lookOf('A')).toBeNull();
    expect(steps()).toBe(2);
    chooseLook('A', null);
    expect(steps()).toBe(2);
  });

  it('F-008.AC2 F-008.R2 RULE-13 a preview shows the look on the selected clip without a step; ending it leaves the project as it was', () => {
    selectClip('A');
    chooseLook('A', 'natural-cool');
    setIntensityOnce('A', 60);
    const before = project.value;
    previewLook('cine-teal-orange');
    expect(previewing.value).toEqual({
      clipId: 'A',
      lookId: 'cine-teal-orange',
      look: { id: 'cine-teal-orange', intensity: 100 },
    });
    previewLook(null);
    expect(previewing.value).toEqual({ clipId: 'A', lookId: null, look: null });
    // The chosen look itself needs no preview: the clip shows as it is, at its own intensity.
    previewLook('natural-cool');
    expect(previewing.value).toBeNull();
    previewLook('bw-soft');
    endLookPreview();
    expect(previewing.value).toBeNull();
    expect(project.value).toBe(before);
    expect(steps()).toBe(2);
  });

  it('F-008.R2 choosing ends the preview (the chosen look is what shows)', () => {
    selectClip('A');
    previewLook('film-instant');
    chooseLook('A', 'film-instant');
    expect(previewing.value).toBeNull();
  });

  it('F-008.R2 a preview ends when the clip stops being the selected video or photo clip', () => {
    selectClip('A');
    previewLook('bw-high');
    selectClip('B');
    expect(previewing.value).toBeNull();
    previewLook('bw-high');
    selection.value = [];
    expect(previewing.value).toBeNull();
  });

  it('F-008.AC3 F-008.R3 the intensity runs 0–100: typed values and keys are one step each and clamp; it needs a chosen look', () => {
    selectClip('A');
    expect(setIntensityOnce('A', 40)).toBeNull();
    expect(steps()).toBe(0);
    chooseLook('A', 'natural-vivid');
    expect(setIntensityOnce('A', 40)).toBe(40);
    expect(setIntensityOnce('A', -5)).toBe(0);
    expect(lookOf('A')).toEqual({ id: 'natural-vivid', intensity: 0 });
    expect(setIntensityOnce('A', 250)).toBe(100);
    expect(setIntensityOnce('A', Number.NaN)).toBe(100);
    expect(steps()).toBe(4);
  });

  it('Q104 RULE-13 one intensity movement is one step; back at its start it is no step and redo is kept', () => {
    selectClip('A');
    chooseLook('A', 'film-pastel');
    const drag = beginIntensityDrag('A', () => undefined);
    for (const v of [90, 70, 50, 30]) drag.set(v);
    drag.end();
    expect(lookOf('A')!.intensity).toBe(30);
    expect(steps()).toBe(2);
    undo();
    expect(lookOf('A')!.intensity).toBe(100);
    const back = beginIntensityDrag('A', () => undefined);
    back.set(60);
    back.set(100);
    back.end();
    expect(steps()).toBe(1);
    expect(history.value.future.length).toBe(1);
  });

  it('CMP-LookGallery the group shown is the chosen look’s, else Natural, until the user picks another (UI state, no step)', () => {
    selectClip('A');
    expect(shownGroup.value).toBe('Natural');
    chooseLook('A', 'cine-moody');
    expect(shownGroup.value).toBe('Cinematic');
    galleryGroup.value = 'Film';
    expect(shownGroup.value).toBe('Film');
    expect(steps()).toBe(1);
  });

  it("RULE-09 the thumbnails' frame: the playhead frame inside the selected clip, else the clip's first frame", () => {
    // A 0–4 s, P 4–7 s, B 7–9 s at 30 fps.
    playhead.value = 5 * S;
    expect(thumbnailFrame(project.value, 'P', playhead.value)).toBe(150);
    expect(thumbnailFrame(project.value, 'B', playhead.value)).toBe(210);
    expect(thumbnailFrame(project.value, 'nope', 0)).toBeNull();
  });
});
