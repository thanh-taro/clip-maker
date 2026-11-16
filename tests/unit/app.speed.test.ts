// MOD-App — clip speed (F-005): what the Speed section shows, a quick choice / typed value as one RULE-13
// step with its notice, and a slider movement as one coalesced gesture measured against the project as it
// began (a movement back to the start leaves no step, Q104), cut by undo. The rule maths is tested in
// project.clips.test.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import { layoutOf, type Project } from '../../src/core';
import { EMPTY_HISTORY, deleteItem, edit, history, playhead, project, redo, selection, undo } from '../../src/project';
import { selectClip } from '../../src/app/arrange';
import { beginSpeedDrag, QUICK_SPEEDS, setSpeedOnce, speedLabel, speedTarget } from '../../src/app/speed';
import { notices, resetNotices } from '../../src/app/notice-stack';
import { S, photo, proj, video } from '../support/project';

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

describe('F-005 speed in the editor', () => {
  beforeEach(() => start(proj({ clips: [video('A', 10), video('B', 5), photo('P', 3)] })));

  it('F-005.R1 RULE-06 the quick choices are 0.25×, 0.5×, 1×, 1.5×, 2× and 4×, written with the language’s decimal mark', () => {
    expect(QUICK_SPEEDS).toEqual([25, 50, 100, 150, 200, 400]);
    expect(QUICK_SPEEDS.map((p) => speedLabel(p, 'en-US'))).toEqual(['0.25×', '0.5×', '1×', '1.5×', '2×', '4×']);
    expect(QUICK_SPEEDS.map((p) => speedLabel(p, 'vi-VN'))).toEqual(['0,25×', '0,5×', '1×', '1,5×', '2×', '4×']);
  });

  it('F-005 Scope only a selected video clip has a speed (photos have a duration instead)', () => {
    expect(speedTarget.value).toBeNull();
    selectClip('P');
    expect(speedTarget.value).toBeNull();
    selectClip('A');
    expect(speedTarget.value).toEqual({ id: 'A', speedPct: 100, length: 10 * S });
  });

  it('F-005.AC1 F-005.R2 picking 2× on a 10 s clip is one step: it lasts 5 s (the shown length) and later clips move 5 s earlier', () => {
    selectClip('A');
    expect(setSpeedOnce('A', 200)).toBe(200);
    expect(steps()).toBe(1);
    expect(speedTarget.value?.length).toBe(5 * S);
    expect(starts()).toEqual([0, 5, 10]);
    undo();
    expect(starts()).toEqual([0, 10, 15]);
  });

  it('F-005.AC4 F-005.R5 a quick 4× on a 0.2 s clip stops at 2.40× and shows COPY-notice.speed_limited', () => {
    start(proj({ clips: [video('A', 0.2)] }));
    selectClip('A');
    expect(setSpeedOnce('A', 400)).toBe(240);
    expect(tags()).toEqual(['speed_limited']);
  });

  it('F-005.AC3 F-005.R4 a typed 0.25× on a 60 s clip in a 9 min 30 s project stops at 0.70× with COPY-notice.length_limited', () => {
    start(proj({ clips: [video('A', 510), video('B', 60)] }));
    selectClip('B');
    expect(setSpeedOnce('B', 25)).toBe(70);
    expect(tags()).toEqual(['length_limited']);
    expect(speedTarget.value?.length).toBe(Math.round(2571 * (S / 30)));
  });

  it('RULE-13 F-014.AC4 a slider movement through many speeds is one step; one undo returns to before it', () => {
    selectClip('A');
    const before = project.value;
    const drag = beginSpeedDrag('A', () => undefined);
    for (let pct = 105; pct <= 400; pct += 5) drag.set(pct);
    drag.end();
    expect(steps()).toBe(1);
    expect(speedTarget.value?.speedPct).toBe(400);
    undo();
    expect(project.value).toBe(before);
  });

  it('Q104 RULE-13 a movement back to the starting speed leaves no step and keeps redo (a default is no change)', () => {
    selectClip('A');
    setSpeedOnce('A', 150);
    undo();
    expect(history.value.future.length).toBe(1);
    const before = project.value;
    const drag = beginSpeedDrag('A', () => undefined);
    for (const pct of [110, 200, 300, 200, 100]) drag.set(pct);
    drag.end();
    expect(project.value).toBe(before);
    expect(steps()).toBe(0);
    expect(history.value.future.length).toBe(1);
    redo();
    expect(speedTarget.value?.speedPct).toBe(150);
  });

  it('RULE-10 Q104 a movement measured from its start: a cross-fade shrunk at 4× comes back when the slider returns', () => {
    start(proj({ clips: [video('A', 4, { crossFadeNext: 2 * S }), video('B', 10)] }));
    selectClip('A');
    const drag = beginSpeedDrag('A', () => undefined);
    drag.set(400);
    expect(project.value.clips[0]!.crossFadeNext).toBe(0.5 * S);
    drag.set(100);
    drag.end();
    expect(project.value.clips[0]!.crossFadeNext).toBe(2 * S);
    expect(steps()).toBe(0);
  });

  it('F-005.R5 a movement past a stop holds the speed there and shows the notice once, at the end', () => {
    start(proj({ clips: [video('A', 0.2)] }));
    selectClip('A');
    const drag = beginSpeedDrag('A', () => undefined);
    for (const pct of [300, 350, 400]) drag.set(pct);
    expect(tags()).toEqual([]);
    expect(speedTarget.value?.speedPct).toBe(240);
    drag.end();
    expect(tags()).toEqual(['speed_limited']);
    expect(steps()).toBe(1);
  });

  it('F-014 an undo during a movement cuts it (onCut); later moves of that movement change nothing', () => {
    selectClip('A');
    setSpeedOnce('A', 150);
    let cut = 0;
    const drag = beginSpeedDrag('A', () => cut++);
    drag.set(300);
    undo();
    expect(cut).toBe(1);
    expect(drag.active).toBe(false);
    expect(speedTarget.value?.speedPct).toBe(150);
    drag.set(350);
    drag.end();
    expect(speedTarget.value?.speedPct).toBe(150);
  });

  it('Q96 an edit landing mid-movement is kept: the movement is cut and its next move starts from the project as it now is', () => {
    selectClip('A');
    let cut = 0;
    const drag = beginSpeedDrag('A', () => cut++);
    drag.set(200);
    // A media batch or key lands meanwhile (here: B deleted).
    edit((p) => deleteItem(p, 'B'));
    expect(cut).toBe(1);
    expect(drag.active).toBe(false);
    drag.set(300);
    drag.end();
    expect(project.value.clips.map((c) => c.id)).toEqual(['A', 'P']);
    // The slider's next input begins a fresh movement from the current project.
    const next = beginSpeedDrag('A', () => undefined);
    next.set(300);
    next.end();
    expect(project.value.clips.map((c) => c.id)).toEqual(['A', 'P']);
    expect(speedTarget.value?.speedPct).toBe(300);
    undo();
    expect(speedTarget.value?.speedPct).toBe(200);
    expect(project.value.clips.map((c) => c.id)).toEqual(['A', 'P']);
  });
});
