// MOD-App — trimming and splitting (F-004): what Split, Start here and End here act on and when they are
// available, the actions on the session's project (one RULE-13 step each, refusals as CMP-Notice), the
// RULE-20 keys, and a trim drag as one coalesced gesture that undo can cut. The rule maths itself is tested
// in project.clips.test.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import { layoutOf, projectEnd, type Project } from '../../src/core';
import { EMPTY_HISTORY, history, playhead, project, selection, undo } from '../../src/project';
import { runArrangeAction, selectClip } from '../../src/app/arrange';
import { beginTrim, clipUnder, splitHere, splitTarget, trimAvailable, trimHere } from '../../src/app/trim';
import { notices, resetNotices } from '../../src/app/notice-stack';
import { S, audio, ids, proj, text, video } from '../support/project';

function start(p: Project): void {
  project.value = p;
  history.value = EMPTY_HISTORY;
  selection.value = [];
  playhead.value = 0;
  resetNotices();
}
const steps = () => history.value.past.length;
const tags = () => notices.value.map((n) => n.tag);
const frames = () => layoutOf(project.value).spans.map((s) => s.frames);
const at = (seconds: number) => (playhead.value = Math.round(seconds * S));

describe('F-004 trimming and splitting in the editor', () => {
  beforeEach(() =>
    start(
      proj({ clips: [video('A', 10), video('B', 5)], audioClips: [audio('M', 2, 10)], textLayers: [text('T', 1, 5)] }),
    ),
  );

  it('F-004.R2 Split acts on the selected item, else on the main-track clip under the playhead', () => {
    at(4);
    expect(splitTarget.value).toBe('A');
    at(12);
    expect(splitTarget.value).toBe('B');
    // At the project end no clip is under the playhead: Split is unavailable with nothing selected.
    at(15);
    expect(splitTarget.value).toBeNull();
    expect(trimAvailable.value).toEqual({ split: false, setIn: false, setOut: false });
    selectClip('M');
    expect(splitTarget.value).toBe('M');
    selectClip(null);
    at(4);
    expect(trimAvailable.value).toEqual({ split: true, setIn: false, setOut: false });
  });

  it('F-004.R2 inside a cross-fade the clip under the playhead is the later one', () => {
    start(proj({ clips: [video('A', 4, { crossFadeNext: S }), video('B', 4)] }));
    expect(clipUnder(project.value, 3.5 * S)).toBe('B');
    expect(clipUnder(project.value, 2.9 * S)).toBe('A');
    expect(clipUnder(project.value, 7 * S)).toBeNull();
  });

  it('F-004.AC3 splitting the clip under the playhead at 4 s gives 4 s and 6 s parts as one undo step', () => {
    at(4);
    expect(splitHere()).toBe(true);
    expect(frames()).toEqual([120, 180, 150]);
    expect(steps()).toBe(1);
    // Nothing was selected, and nothing is afterwards.
    expect(selection.value).toEqual([]);
    undo();
    expect(frames()).toEqual([300, 150]);
  });

  it('F-004.AC4 a split 2 frames from the clip’s start changes nothing and shows COPY-notice.split_too_close', () => {
    selectClip('B');
    playhead.value = 10 * S + 66_667;
    expect(splitHere()).toBe(false);
    expect(ids(project.value)).toEqual(['A', 'B']);
    expect(tags()).toEqual(['split_too_close']);
    expect(steps()).toBe(0);
  });

  it('F-004.AC5 the audio clip’s start set to 4 s leaves a gap at 2–4 s; the text split at 3 s gives two layers', () => {
    selectClip('M');
    at(4);
    expect(trimAvailable.value).toEqual({ split: true, setIn: true, setOut: true });
    expect(trimHere('start')).toBe(true);
    const m = project.value.audioClips[0]!;
    expect([m.start, m.start + m.out - m.in]).toEqual([4 * S, 10 * S]);
    selectClip('T');
    at(3);
    expect(splitHere()).toBe(true);
    expect(project.value.textLayers.map((t) => [t.start, t.end])).toEqual([
      [1 * S, 3 * S],
      [3 * S, 5 * S],
    ]);
    expect(steps()).toBe(2);
  });

  it('F-004.R6 Start here and End here need a selected item with the playhead inside it', () => {
    selectClip('B');
    at(4);
    expect(trimAvailable.value.setIn).toBe(false);
    expect(trimHere('start')).toBe(false);
    at(10);
    // At the item's first frame there is nothing to trim.
    expect(trimAvailable.value.setIn).toBe(false);
    at(12);
    expect(trimAvailable.value).toEqual({ split: true, setIn: true, setOut: true });
    expect(steps()).toBe(0);
  });

  it('F-004.AC8 setting the in point and out point of the selected clip at the playhead trims it (keys I and O)', () => {
    selectClip('A');
    at(2);
    expect(runArrangeAction('set-in')).toBe(true);
    // The clip keeps its place; its first frame is now source 2 s, and B moves 2 s earlier.
    expect(project.value.clips[0]).toMatchObject({ in: 2 * S, out: 10 * S });
    expect(layoutOf(project.value).spans[1]!.startFrame).toBe(240);
    at(5);
    expect(runArrangeAction('set-out')).toBe(true);
    expect(project.value.clips[0]).toMatchObject({ in: 2 * S, out: 7 * S });
    expect(projectEnd(project.value)).toBe(10 * S);
    expect(steps()).toBe(2);
    // A held key acts once; S splits.
    at(1);
    expect(runArrangeAction('split', true)).toBe(true);
    expect(steps()).toBe(2);
    expect(runArrangeAction('split')).toBe(true);
    expect(project.value.clips).toHaveLength(3);
  });

  it('RULE-13 F-004.R1 a trim drag is one undo step however many moves it makes; back where it began, none', () => {
    let cut = 0;
    const drag = beginTrim('A', 'end', () => cut++);
    for (const s of [9, 8, 7, 6]) drag.to(s * S);
    drag.end();
    expect(frames()).toEqual([180, 150]);
    expect(steps()).toBe(1);
    undo();
    expect(frames()).toEqual([300, 150]);
    const back = beginTrim('A', 'start', () => cut++);
    back.to(3 * S);
    back.to(0);
    back.end();
    expect(steps()).toBe(0);
    expect(cut).toBe(0);
  });

  it('RULE-13 F-014.R4 undo during a trim drag cuts it: the owner is told and later moves do nothing', () => {
    let cut = 0;
    const drag = beginTrim('A', 'end', () => cut++);
    drag.to(6 * S);
    expect(frames()).toEqual([180, 150]);
    undo();
    expect(cut).toBe(1);
    expect(drag.active).toBe(false);
    drag.to(4 * S);
    drag.end();
    expect(frames()).toEqual([300, 150]);
    expect(steps()).toBe(0);
  });

  it('F-004.AC2 a drag past the source end does not grow the clip and leaves no step', () => {
    const drag = beginTrim('B', 'end', () => undefined);
    drag.to(20 * S);
    drag.end();
    expect(frames()).toEqual([300, 150]);
    expect(steps()).toBe(0);
  });

  it('RULE-03 a trim drag stopped at the 10-minute limit shows COPY-notice.length_limited once, at the end', () => {
    start(proj({ clips: [video('A', 580), video('B', 30, {}, 20)] }));
    const drag = beginTrim('B', 'start', () => undefined);
    drag.to(575 * S);
    drag.to(560 * S);
    expect(tags()).toEqual([]);
    drag.end();
    expect(tags()).toEqual(['length_limited']);
    expect(projectEnd(project.value)).toBe(600 * S);
    expect(steps()).toBe(1);
  });
});
