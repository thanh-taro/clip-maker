// MOD-App — fades and cross-fades (F-009): what the Fades rows and the cross-fade controls show, each field
// value, quick toggle and popover button as one RULE-13 step with its notice, a slider movement as one
// coalesced gesture measured from where it began (Q104), and the phone tile. The rule maths is tested in
// project.items.test.ts, the picture and sound in plan.frame.test.ts, compositor.draw.test.ts and
// audio.mixer.test.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import { projectEnd, type Project } from '../../src/core';
import { EMPTY_HISTORY, edit, history, playhead, project, selection, setSpeed, undo } from '../../src/project';
import { selectClip } from '../../src/app/arrange';
import {
  addCrossFade,
  beginFadeDrag,
  crossFadeTile,
  fadeTarget,
  joinOf,
  openJoin,
  openJoinState,
  removeCrossFade,
  secondsLabel,
  setFadeOnce,
  stepCrossFade,
  tenthsOf,
  tileJoin,
  toggleQuickFade,
} from '../../src/app/fades';
import { notices, resetNotices } from '../../src/app/notice-stack';
import { S, audio, photo, proj, video } from '../support/project';

function start(p: Project): void {
  project.value = p;
  history.value = EMPTY_HISTORY;
  selection.value = [];
  playhead.value = 0;
  openJoin.value = null;
  resetNotices();
}
const steps = () => history.value.past.length;
const tags = () => notices.value.map((n) => n.tag);
const clip = (i: number) => project.value.clips[i]!;

describe('F-009 fades in the editor', () => {
  beforeEach(() => start(proj({ clips: [video('A', 5), photo('P', 3)], audioClips: [audio('M', 0, 8)] })));

  it('F-009.R1 F-009.R4 the Fades rows follow the selection: a clip has 0–3 s, an audio clip 0–5 s, nothing selected none', () => {
    expect(fadeTarget.value).toBeNull();
    selectClip('A');
    expect(fadeTarget.value).toEqual({ id: 'A', kind: 'clip', fadeIn: 0, fadeOut: 0, maxTenths: 30 });
    selectClip('P');
    expect(fadeTarget.value?.kind).toBe('clip');
    selectClip('M');
    expect(fadeTarget.value).toEqual({ id: 'M', kind: 'audio', fadeIn: 0, fadeOut: 0, maxTenths: 50 });
  });

  it('F-009.R1 RULE-13 a typed fade in is one step; undo takes it back', () => {
    selectClip('A');
    expect(setFadeOnce('A', 'in', 10)).toBe(10);
    expect(clip(0).fadeIn).toBe(S);
    expect(steps()).toBe(1);
    undo();
    expect(clip(0).fadeIn).toBe(0);
  });

  it('F-009.R5 RULE-10 a value beyond the limits is reduced: 4 s → 3 s; fade out then gets only what is left of the clip', () => {
    selectClip('A');
    expect(setFadeOnce('A', 'in', 40)).toBe(30);
    expect(setFadeOnce('A', 'out', 30)).toBe(20);
    expect(clip(0).fadeIn + clip(0).fadeOut).toBe(5 * S);
  });

  it('F-009.R4 RULE-10 an audio clip fade out of 6 s is reduced to 5 s', () => {
    selectClip('M');
    expect(setFadeOnce('M', 'out', 60)).toBe(50);
    expect(project.value.audioClips[0]!.fadeOut).toBe(5 * S);
  });

  it('RULE-10 CMP-Inspector the quick toggle sets 0.5 s; activated again, the fade is off; one step each', () => {
    selectClip('A');
    expect(toggleQuickFade('A', 'out')).toBe(5);
    expect(clip(0).fadeOut).toBe(0.5 * S);
    expect(toggleQuickFade('A', 'out')).toBe(0);
    expect(steps()).toBe(2);
    // A longer fade counts as on: the toggle turns it off.
    setFadeOnce('A', 'in', 20);
    expect(toggleQuickFade('A', 'in')).toBe(0);
  });

  it('F-009.R5 RULE-10 at 24 fps a 0.1 s fade is applied as whole frames and reads back as 0.1 s', () => {
    start(proj({ clips: [video('A', 5)], rate: 24 }));
    selectClip('A');
    expect(setFadeOnce('A', 'in', 1)).toBe(1);
    expect(clip(0).fadeIn).toBe(frameUs(2, 24));
  });

  it('RULE-13 Q104 a fade slider movement is one step; a movement back to its start leaves no step and keeps redo', () => {
    selectClip('A');
    const drag = beginFadeDrag('A', 'in', () => undefined);
    for (const v of [1, 5, 12, 20]) drag.set(v);
    drag.end();
    expect(clip(0).fadeIn).toBe(2 * S);
    expect(steps()).toBe(1);
    undo();
    expect(history.value.future.length).toBe(1);
    const back = beginFadeDrag('A', 'in', () => undefined);
    back.set(8);
    back.set(0);
    back.end();
    expect(steps()).toBe(0);
    expect(history.value.future.length).toBe(1);
  });

  it('F-014 Q96 an outside edit cuts an open fade movement; its later moves start a new step', () => {
    selectClip('A');
    let cut = 0;
    const drag = beginFadeDrag('A', 'out', () => cut++);
    drag.set(10);
    edit((p) => setSpeed(p, 'A', 200));
    expect(cut).toBe(1);
    expect(drag.active).toBe(false);
    drag.set(20);
    expect(clip(0).fadeOut).toBe(S);
  });

  it('secondsLabel writes one decimal and the unit in the language’s format', () => {
    expect(secondsLabel(5, 'en-US')).toBe('0.5 s');
    expect(secondsLabel(5, 'vi-VN')).toBe('0,5 s');
    expect(secondsLabel(20, 'en-US')).toBe('2.0 s');
    expect(tenthsOf(frameUs(8, 25))).toBe(3);
  });
});

const frameUs = (k: number, rate: number) => Math.round((k * S) / rate);

describe('F-009 cross-fades in the editor', () => {
  beforeEach(() => start(proj({ clips: [video('A', 5), video('B', 5), video('C', 0.1)] })));

  it('F-009.AC2 F-009.R3 CMP-Timeline the add chip adds a 0.5 s cross-fade as one step; the project is 0.5 s shorter', () => {
    expect(joinOf(project.value, 'A')).toMatchObject({ tenths: 0, available: true });
    expect(addCrossFade('A')).toBe(true);
    expect(clip(0).crossFadeNext).toBe(0.5 * S);
    expect(projectEnd(project.value)).toBe(9.6 * S);
    expect(steps()).toBe(1);
  });

  it('F-009.AC9 F-009.R7 the join before a 0.1 s clip is unavailable with COPY-notice.crossfade_too_short; asking adds nothing', () => {
    const before = project.value;
    expect(joinOf(before, 'B')).toMatchObject({ available: false, reason: 'notice.crossfade_too_short' });
    expect(addCrossFade('B')).toBe(false);
    expect(project.value).toBe(before);
    expect(steps()).toBe(0);
    expect(tags()).toEqual(['crossfade_too_short']);
    // The last clip has no join after it.
    expect(joinOf(before, 'C')).toMatchObject({ available: false, reason: null });
  });

  it('F-009.R2 RULE-10 Shorter and Longer move by 0.1 s within 0.1–2 s; each is one step', () => {
    addCrossFade('A');
    expect(stepCrossFade('A', 1)).toBe(6);
    expect(stepCrossFade('A', -1)).toBe(5);
    expect(steps()).toBe(3);
    for (let i = 0; i < 30; i++) stepCrossFade('A', 1);
    expect(clip(0).crossFadeNext).toBe(2 * S);
    expect(joinOf(project.value, 'A')).toMatchObject({ tenths: 20, canLengthen: false, canShorten: true });
    for (let i = 0; i < 30; i++) stepCrossFade('A', -1);
    expect(joinOf(project.value, 'A')).toMatchObject({ tenths: 1, canShorten: false });
  });

  it('F-009.AC5 F-009.R5 Longer stops at half the shorter clip (1 s clip → 0.5 s)', () => {
    start(proj({ clips: [video('A', 1), video('B', 5)] }));
    addCrossFade('A');
    expect(joinOf(project.value, 'A')).toMatchObject({ tenths: 5, canLengthen: false });
    expect(stepCrossFade('A', 1)).toBe(5);
    expect(steps()).toBe(1);
  });

  it('F-009.AC3 Remove takes the cross-fade away as one step; the project is 10 s again', () => {
    start(proj({ clips: [video('A', 5), video('B', 5)] }));
    addCrossFade('A');
    openJoin.value = 'A';
    expect(openJoinState.value?.tenths).toBe(5);
    expect(removeCrossFade('A')).toBe(true);
    expect(projectEnd(project.value)).toBe(10 * S);
    // The popover's join has no cross-fade any more: it closes.
    expect(openJoinState.value).toBeNull();
  });

  it('F-009.AC6 F-009.R6 removing or shortening a cross-fade in a 9 min 59.5 s project is refused with COPY-notice.length_full', () => {
    start(proj({ clips: [video('A', 300, { crossFadeNext: S }), video('B', 300.5)] }));
    const before = project.value;
    expect(removeCrossFade('A')).toBe(false);
    expect(project.value).toBe(before);
    expect(tags()).toEqual(['length_full']);
    // A 10 min project: even 0.1 s shorter is refused.
    start(proj({ clips: [video('A', 300, { crossFadeNext: S }), video('B', 301)] }));
    expect(stepCrossFade('A', -1)).toBe(10);
    expect(tags()).toEqual(['length_full']);
  });

  it('CMP-Timeline narrow the Cross-fade tile adds 0.5 s after the selected clip and opens its popover; unavailable it shows why', () => {
    expect(tileJoin.value).toBeNull();
    selectClip('A');
    expect(crossFadeTile()).toBe(true);
    expect(clip(0).crossFadeNext).toBe(0.5 * S);
    expect(openJoin.value).toBe('A');
    // Activated again with the cross-fade in place: no new step, the popover stays open.
    expect(crossFadeTile()).toBe(true);
    expect(steps()).toBe(1);
    selectClip('B');
    expect(tileJoin.value).toMatchObject({ available: false, reason: 'notice.crossfade_too_short' });
    expect(crossFadeTile()).toBe(false);
    expect(tags()).toContain('crossfade_too_short');
    selectClip('C');
    expect(tileJoin.value?.available).toBe(false);
  });
});
