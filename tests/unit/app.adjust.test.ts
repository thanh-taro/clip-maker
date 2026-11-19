// MOD-App — colour and light (F-007): what the Adjust tab and the phone Adjust sheet act on, each control
// as one RULE-13 step (typed values, slider keys, per-row Reset, Reset all, Paste colour, Apply to all), a
// slider movement as one gesture measured from where it began (back at its start: no step and redo kept,
// Q104), Copy colour and the compare hold as no step at all. MOD-Keys' F-007 keys (RULE-20) too. The rule
// maths is MOD-Core's (RULE-08 ranges; defaults are never stored) and MOD-Project's operations.
import { beforeEach, describe, expect, it } from 'vitest';
import { clampAdjustments, RULE_08, type Adjustments, type Project } from '../../src/core';
import { resolveKey } from '../../src/keys';
import {
  copiedGrade,
  edit,
  EMPTY_HISTORY,
  history,
  newProject,
  playhead,
  project,
  redo,
  selection,
  setAdjustments,
  undo,
} from '../../src/project';
import {
  ADJUST_GROUPS,
  adjustTarget,
  applyColourToAll,
  beginAdjustDrag,
  canApplyAll,
  canPaste,
  comparing,
  copyColour,
  holdCompare,
  isBipolar,
  pasteColour,
  rangeOf,
  releaseCompare,
  resetAll,
  resetOne,
  setAdjustmentOnce,
  signedLabel,
} from '../../src/app/adjust';
import { selectClip } from '../../src/app/arrange';
import { audio, photo, proj, video } from '../support/project';

function start(p: Project): void {
  project.value = p;
  history.value = EMPTY_HISTORY;
  selection.value = [];
  playhead.value = 0;
  copiedGrade.value = null;
  releaseCompare();
}
const steps = () => history.value.past.length;
const adj = (id: string): Adjustments => project.value.clips.find((c) => c.id === id)!.adjustments;
const clip = (id: string) => project.value.clips.find((c) => c.id === id)!;
const LOOK = { id: 'film-warm', intensity: 70 };

const ALL: Adjustments = {
  brightness: 10,
  contrast: -20,
  highlights: 30,
  shadows: -40,
  saturation: 50,
  vibrance: -60,
  temperature: 70,
  tint: -80,
  sharpen: 15,
  vignette: 25,
  grain: 35,
  fade: 45,
};

describe('F-007 adjustments in the editor', () => {
  beforeEach(() =>
    start(
      proj({
        clips: [video('A', 4), photo('P', 3), video('B', 2)],
        audioClips: [audio('M', 0, 5)],
      }),
    ),
  );

  it('F-007 Edge cases a selected video or photo clip can be adjusted (a photo as a video); audio clips and nothing selected cannot', () => {
    expect(adjustTarget.value).toBeNull();
    selectClip('M');
    expect(adjustTarget.value).toBeNull();
    selectClip('P');
    expect(adjustTarget.value).toMatchObject({ id: 'P', adjustments: {}, look: null, changed: false });
    selectClip('A');
    expect(adjustTarget.value?.id).toBe('A');
  });

  it('CMP-Inspector "clip Adjust" the groups list the twelve RULE-08 adjustments once each, with RULE-08 ranges', () => {
    const names = ADJUST_GROUPS.flatMap((g) => g.names);
    expect(ADJUST_GROUPS.map((g) => g.group)).toEqual(['light', 'colour', 'effects']);
    expect([...names].sort()).toEqual([...RULE_08.bipolar, ...RULE_08.unipolar].sort());
    for (const n of RULE_08.bipolar) expect(rangeOf(n)).toEqual({ min: -100, max: 100 });
    for (const n of RULE_08.unipolar) expect(rangeOf(n)).toEqual({ min: 0, max: 100 });
    expect(isBipolar('tint')).toBe(true);
    expect(isBipolar('grain')).toBe(false);
  });

  it('F-007.R1 RULE-08 each adjustment is set within its range: one step per typed value or slider key', () => {
    expect(setAdjustmentOnce('A', 'brightness', 40)).toBe(40);
    expect(setAdjustmentOnce('A', 'grain', 150)).toBe(100);
    expect(setAdjustmentOnce('A', 'tint', -300)).toBe(-100);
    expect(setAdjustmentOnce('A', 'fade', -5)).toBe(0);
    expect(setAdjustmentOnce('A', 'contrast', 12.4)).toBe(12);
    expect(adj('A')).toEqual({ brightness: 40, contrast: 12, tint: -100, grain: 100 });
    expect(steps()).toBe(4); // fade −5 → 0 changed nothing
  });

  it('F-007.AC7 F-007.R6 Saturation: a key press changes it by 1, typing 25 sets 25', () => {
    selectClip('A');
    setAdjustmentOnce('A', 'saturation', 1); // what a slider's ArrowRight sends
    setAdjustmentOnce('A', 'saturation', 2);
    setAdjustmentOnce('A', 'saturation', 1); // ArrowLeft
    expect(adj('A').saturation).toBe(1);
    expect(setAdjustmentOnce('A', 'saturation', 25)).toBe(25);
    expect(steps()).toBe(4);
  });

  it('Q104 RULE-08 a default value is never stored: setting an adjustment back to 0 leaves {} (not { brightness: 0 })', () => {
    setAdjustmentOnce('A', 'brightness', 30);
    setAdjustmentOnce('A', 'brightness', 0);
    expect(adj('A')).toEqual({});
    expect(clampAdjustments({ brightness: 0, grain: 0, tint: -0.2 })).toEqual({});
    expect(Object.keys(setAdjustments(project.value, 'A', { saturation: 0 }).project.clips[0]!.adjustments)).toEqual(
      [],
    );
  });

  it('Q104 F-014.R4 RULE-13 a slider dragged away and back to its default leaves no undo step and keeps redo', () => {
    setAdjustmentOnce('A', 'contrast', 10);
    undo();
    expect(history.value.future.length).toBe(1);
    const before = project.value;
    const d = beginAdjustDrag('A', 'brightness', () => undefined);
    for (const v of [5, 20, 40, 15, 0]) d.set(v);
    d.end();
    expect(project.value).toBe(before);
    expect(adj('A')).toEqual({});
    expect(steps()).toBe(0);
    expect(history.value.future.length).toBe(1);
    redo();
    expect(adj('A')).toEqual({ contrast: 10 });
  });

  it('F-014.AC4 RULE-13 an adjustment slider dragged through many values is one step; one undo restores it', () => {
    setAdjustmentOnce('A', 'brightness', 12);
    const d = beginAdjustDrag('A', 'brightness', () => undefined);
    for (let v = 13; v <= 60; v++) d.set(v);
    d.end();
    expect(adj('A').brightness).toBe(60);
    expect(steps()).toBe(2);
    undo();
    expect(adj('A')).toEqual({ brightness: 12 });
  });

  it('RULE-08 drag detent (Q140): a bipolar slider movement landing within ±2 of the default lands on 0; keys and fields still reach ±1 and ±2', () => {
    setAdjustmentOnce('A', 'brightness', 30);
    for (const landing of [2, 1, -1, -2]) {
      const d = beginAdjustDrag('A', 'brightness', () => undefined);
      d.set(landing);
      expect(adj('A').brightness ?? 0).toBe(0);
      d.set(-3);
      expect(adj('A').brightness).toBe(-3);
      d.set(landing);
      d.end();
      expect(adj('A')).toEqual({});
      setAdjustmentOnce('A', 'brightness', 30);
    }
    expect(RULE_08.dragDetent).toBe(2);
    const d = beginAdjustDrag('A', 'tint', () => undefined);
    d.set(3);
    d.end();
    expect(adj('A').tint).toBe(3);
    // A unipolar slider has no detent: its default is the end of the track, which every engine reaches.
    const u = beginAdjustDrag('A', 'grain', () => undefined);
    u.set(1);
    u.end();
    expect(adj('A').grain).toBe(1);
    // The keys (one step each) and the number field are not movements: ±1 and ±2 stay reachable.
    for (const v of [1, 2, -1, -2]) expect(setAdjustmentOnce('A', 'saturation', v)).toBe(v);
  });

  it('RULE-13 F-014 undo during a slider movement cuts it: onCut runs and the next move starts a new step', () => {
    setAdjustmentOnce('A', 'vignette', 5);
    let cut = 0;
    const d = beginAdjustDrag('A', 'vignette', () => cut++);
    d.set(30);
    undo(); // undoes the drag's step
    expect(cut).toBe(1);
    expect(d.active).toBe(false);
    d.set(50); // ignored: the movement is over
    expect(adj('A').vignette).toBe(5);
  });

  it('F-007.AC3 F-007.R3 with every adjustment non-zero, Reset on Temperature returns only it to 0; Reset all returns all to default; one step each', () => {
    edit((p) => setAdjustments(p, 'A', ALL));
    selectClip('A');
    expect(adjustTarget.value?.changed).toBe(true);
    const s = steps();
    resetOne('A', 'temperature');
    const { temperature: _t, ...rest } = ALL;
    expect(adj('A')).toEqual(rest);
    expect(steps()).toBe(s + 1);
    resetAll('A');
    expect(adj('A')).toEqual({});
    expect(steps()).toBe(s + 2);
    expect(adjustTarget.value?.changed).toBe(false);
    resetAll('A'); // already at the defaults: no step
    resetOne('A', 'tint');
    expect(steps()).toBe(s + 2);
  });

  it('F-008.R4 Reset all keeps the look', () => {
    start(proj({ clips: [video('A', 4, { adjustments: { brightness: 30 }, look: LOOK })] }));
    resetAll('A');
    expect(clip('A')).toMatchObject({ adjustments: {}, look: LOOK });
  });

  it('F-007.AC4 F-007.R4 RULE-13 Apply to all: clips 2 and 3 get clip 1’s adjustments and look as one step; one undo restores them and nothing is selected (Q103)', () => {
    start(
      proj({
        clips: [
          video('A', 4, { adjustments: { brightness: 40, fade: 20 }, look: LOOK }),
          photo('P', 3, { adjustments: { contrast: -10 } }),
          video('B', 2),
        ],
      }),
    );
    selectClip('A');
    expect(canApplyAll.value).toBe(true);
    applyColourToAll('A');
    for (const id of ['P', 'B'])
      expect(clip(id)).toMatchObject({ adjustments: { brightness: 40, fade: 20 }, look: LOOK });
    expect(steps()).toBe(1);
    undo();
    expect(clip('P')).toMatchObject({ adjustments: { contrast: -10 }, look: null });
    expect(clip('B')).toMatchObject({ adjustments: {}, look: null });
    expect(selection.value).toEqual([]);
  });

  it('F-007.R4 Apply to all with one clip only has nothing to reach and makes no step', () => {
    start(proj({ clips: [video('A', 4, { adjustments: { brightness: 40 } })] }));
    selectClip('A');
    expect(canApplyAll.value).toBe(false);
    applyColourToAll('A');
    expect(steps()).toBe(0);
  });

  it('F-007.AC5 F-007.R4 RULE-08 clip 1’s colour copied and pasted onto clip 3: clip 3 matches its adjustments and look; copying is no step, pasting one', () => {
    start(
      proj({
        clips: [
          video('A', 4, { adjustments: { saturation: -20, grain: 10 }, look: LOOK }),
          video('B', 3),
          photo('C', 3),
        ],
      }),
    );
    selectClip('A');
    expect(canPaste.value).toBe(false);
    expect(copyColour('A')).toBe(true);
    expect(steps()).toBe(0);
    selectClip('C');
    expect(canPaste.value).toBe(true);
    expect(pasteColour('C')).toBe(true);
    expect(clip('C')).toMatchObject({ adjustments: { saturation: -20, grain: 10 }, look: LOOK });
    expect(steps()).toBe(1);
    // A later change to clip 1 does not reach the copy.
    setAdjustmentOnce('A', 'saturation', 50);
    pasteColour('B');
    expect(clip('B').adjustments).toEqual({ saturation: -20, grain: 10 });
  });

  it('F-007 Edge cases pasting with nothing copied: Paste colour is unavailable and pastes nothing', () => {
    selectClip('A');
    expect(canPaste.value).toBe(false);
    expect(pasteColour('A')).toBe(false);
    expect(steps()).toBe(0);
  });

  it('RULE-23 a new project clears the copied colour', () => {
    copyColour('A');
    newProject();
    expect(copiedGrade.value).toBeNull();
    expect(canPaste.value).toBe(false);
  });

  it('F-007.AC9 F-007.R7 RULE-08 holding compare shows the selected clip without adjustments and look; release restores; no undo step', () => {
    start(proj({ clips: [video('A', 4, { adjustments: { brightness: 50 }, look: LOOK })] }));
    holdCompare('control'); // nothing selected: nothing to compare
    expect(comparing.value).toBeNull();
    selectClip('A');
    holdCompare('control');
    expect(comparing.value).toBe('A');
    releaseCompare('control');
    expect(comparing.value).toBeNull();
    expect(steps()).toBe(0);
    expect(clip('A')).toMatchObject({ adjustments: { brightness: 50 }, look: LOOK });
  });

  it('F-007.R7 RULE-20 the control and the \\ key hold compare each on their own; it ends when both let go or the clip stops being selected', () => {
    selectClip('A');
    holdCompare('control');
    holdCompare('key');
    releaseCompare('control');
    expect(comparing.value).toBe('A');
    releaseCompare('key');
    expect(comparing.value).toBeNull();
    holdCompare('key');
    selectClip('M');
    expect(comparing.value).toBeNull();
  });

  it('CMP-Inspector "clip Adjust" values read "+12", "−8" and "0" on bipolar sliders, plain on the others', () => {
    expect(signedLabel(12, true)).toBe('+12');
    expect(signedLabel(-8, true)).toBe('−8');
    expect(signedLabel(0, true)).toBe('0');
    expect(signedLabel(20, false)).toBe('20');
  });
});

describe('MOD-Keys F-007 keys (RULE-20)', () => {
  type Ev = Parameters<typeof resolveKey>[0];
  const key = (code: string, mods: Partial<Omit<Ev, 'code' | 'key'>> = {}): Ev => ({
    code,
    key: code,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });

  it('RULE-20 Mod+C and Mod+V copy and paste a clip’s colour (Cmd on macOS, Ctrl elsewhere)', () => {
    expect(resolveKey(key('KeyC', { metaKey: true }), 'none', true)).toBe('copy-colour');
    expect(resolveKey(key('KeyV', { metaKey: true }), 'none', true)).toBe('paste-colour');
    expect(resolveKey(key('KeyC', { ctrlKey: true }), 'none', false)).toBe('copy-colour');
    expect(resolveKey(key('KeyV', { ctrlKey: true }), 'none', false)).toBe('paste-colour');
    expect(resolveKey(key('KeyC', { ctrlKey: true }), 'none', true)).toBeNull();
    expect(resolveKey(key('KeyC'), 'none')).toBeNull();
    expect(resolveKey(key('KeyV', { ctrlKey: true, shiftKey: true }), 'none')).toBeNull();
  });

  it('RULE-20 hold \\ compares; not with a modifier, and not while a field is edited or a dialog or menu is open', () => {
    expect(resolveKey(key('Backslash'), 'none')).toBe('compare');
    expect(resolveKey(key('Backslash', { shiftKey: true }), 'none')).toBeNull();
    expect(resolveKey(key('Backslash', { ctrlKey: true }), 'none')).toBeNull();
    expect(resolveKey(key('Backslash'), 'field')).toBeNull();
    expect(resolveKey(key('Backslash'), 'dialog')).toBeNull();
    expect(resolveKey(key('KeyC', { ctrlKey: true }), 'field')).toBeNull();
  });
});
