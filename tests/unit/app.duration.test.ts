// MOD-App — a photo clip's duration (F-004.R8, build question 150): what the Duration row shows, a typed value
// or slider key as one RULE-13 step with its notice, and a slider movement as one coalesced gesture measured
// against the project as it began (back to the start leaves no step, Q104), its notice shown once at the end.
// The rule maths (RULE-05 0.1–60 s, whole frames) is tested in project.clips.test.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import { layoutOf, type Project } from '../../src/core';
import { EMPTY_HISTORY, history, playhead, project, redo, selection, undo } from '../../src/project';
import { selectClip } from '../../src/app/arrange';
import {
  beginDurationDrag,
  DURATION_MAX_TENTHS,
  DURATION_MIN_TENTHS,
  durationTarget,
  setDurationOnce,
} from '../../src/app/duration';
import { setFadeOnce } from '../../src/app/fades';
import { notices, resetNotices } from '../../src/app/notice-stack';
import { photo, proj, video } from '../support/project';

function start(p: Project): void {
  project.value = p;
  history.value = EMPTY_HISTORY;
  selection.value = [];
  playhead.value = 0;
  resetNotices();
}
const steps = () => history.value.past.length;
const tags = () => notices.value.map((n) => n.tag);
const starts = () => layoutOf(project.value).spans.map((s) => s.startFrame / 30);

describe('F-004.R8 a photo’s Duration row', () => {
  beforeEach(() => start(proj({ clips: [photo('P', 3), video('B', 5)] })));

  it('F-004.R8 RULE-05 only a selected photo has a Duration row, 0.1–60 s in 0.1 s steps; it reads the photo’s duration', () => {
    expect(durationTarget.value).toBeNull();
    selectClip('B');
    expect(durationTarget.value).toBeNull();
    selectClip('P');
    expect(durationTarget.value).toEqual({ id: 'P', tenths: 30 });
    expect([DURATION_MIN_TENTHS, DURATION_MAX_TENTHS]).toEqual([1, 600]);
  });

  it('F-004.AC11 a 3 s photo set to 4.5 s in its field: it lasts 4.5 s, the next clip starts at 4.5 s, one step; undo restores 3 s', () => {
    selectClip('P');
    expect(setDurationOnce('P', 45)).toBe(45);
    expect(steps()).toBe(1);
    expect(starts()).toEqual([0, 4.5]);
    undo();
    expect(durationTarget.value?.tenths).toBe(30);
    expect(starts()).toEqual([0, 3]);
  });

  it('F-004.AC13 RULE-05 typed values outside 0.1–60 s are clamped to the range (one step each)', () => {
    selectClip('P');
    expect(setDurationOnce('P', 0)).toBe(1);
    expect(setDurationOnce('P', 900)).toBe(600);
    expect(steps()).toBe(2);
    expect(setDurationOnce('P', Number.NaN)).toBe(600);
    expect(steps()).toBe(2);
  });

  it('F-004.AC13 RULE-03 a 3 s photo in a 9 min 58 s project set to 10 s stops at 5 s with COPY-notice.length_limited', () => {
    start(proj({ clips: [photo('P', 3), video('B', 595)] }));
    selectClip('P');
    expect(setDurationOnce('P', 100)).toBe(50);
    expect(tags()).toEqual(['length_limited']);
  });

  it('F-004.AC12 RULE-13 F-014.AC4 a Duration slider movement through many values is one step; one undo returns to before it', () => {
    selectClip('P');
    const before = project.value;
    const drag = beginDurationDrag('P', () => undefined);
    for (let v = 31; v <= 120; v++) drag.set(v);
    drag.end();
    expect(steps()).toBe(1);
    expect(durationTarget.value?.tenths).toBe(120);
    expect(starts()).toEqual([0, 12]);
    undo();
    expect(project.value).toBe(before);
  });

  it('F-004.AC12 Q104 RULE-10 a movement back to the starting duration leaves no step, keeps redo and puts shrunk fades back', () => {
    selectClip('P');
    setFadeOnce('P', 'out', 20);
    setFadeOnce('P', 'in', 5);
    undo(); // a redo step to keep
    const before = project.value;
    const s = steps();
    const drag = beginDurationDrag('P', () => undefined);
    for (const v of [20, 5, 1, 12, 30]) drag.set(v);
    drag.end();
    expect(project.value).toBe(before);
    expect(steps()).toBe(s);
    expect(history.value.future.length).toBe(1);
    redo();
    expect(project.value.clips[0]!.fadeIn).toBeGreaterThan(0);
  });

  it('F-004.AC13 RULE-03 a slider movement past the limit holds at the limit and shows its notice once, when it ends', () => {
    start(proj({ clips: [photo('P', 3), video('B', 595)] }));
    selectClip('P');
    const drag = beginDurationDrag('P', () => undefined);
    for (let v = 40; v <= 200; v += 10) drag.set(v);
    expect(durationTarget.value?.tenths).toBe(50);
    expect(tags()).toEqual([]);
    drag.end();
    expect(tags()).toEqual(['length_limited']);
    expect(steps()).toBe(1);
  });

  it('RULE-13 F-014 undo during a Duration movement cuts it: onCut runs and later moves do nothing', () => {
    selectClip('P');
    setDurationOnce('P', 40);
    let cut = 0;
    const drag = beginDurationDrag('P', () => cut++);
    drag.set(60);
    undo();
    expect(cut).toBe(1);
    expect(drag.active).toBe(false);
    drag.set(80);
    expect(durationTarget.value?.tenths).toBe(40);
  });
});
