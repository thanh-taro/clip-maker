// MOD-App — arranging clips (F-003): the selection, the visible controls' availability, and the move,
// delete and duplicate actions on the session's project, each one RULE-13 step through MOD-Project's
// history, with refusals shown as CMP-Notice. The domain maths is tested in project.clips.test.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import { layoutOf, projectEnd, type Project } from '../../src/core';
import { EMPTY_HISTORY, history, project, selection, undo } from '../../src/project';
import {
  arrangeAvailable,
  deleteSelected,
  duplicateSelected,
  moveClipTo,
  moveSelected,
  runArrangeAction,
  selectClip,
  selectedClip,
} from '../../src/app/arrange';
import { notices, resetNotices } from '../../src/app/notice-stack';
import { S, ids, photo, proj, video } from '../support/project';

function start(p: Project): void {
  project.value = p;
  history.value = EMPTY_HISTORY;
  selection.value = [];
  resetNotices();
}
const steps = () => history.value.past.length;
const tags = () => notices.value.map((n) => n.tag);

describe('F-003 arranging clips in the editor', () => {
  beforeEach(() => start(proj({ clips: [video('A', 4), photo('B', 3), video('C', 5)] })));

  it('F-003.R1 the user selects a clip; the selection decides what the clip actions act on', () => {
    expect(selectedClip.value).toBeNull();
    expect(arrangeAvailable.value).toEqual({ earlier: false, later: false, delete: false, duplicate: false });
    selectClip('B');
    expect(selection.value).toEqual(['B']);
    expect(selectedClip.value?.id).toBe('B');
    expect(arrangeAvailable.value).toEqual({ earlier: true, later: true, delete: true, duplicate: true });
    selectClip('A');
    expect(arrangeAvailable.value.earlier).toBe(false);
    selectClip('C');
    expect(arrangeAvailable.value.later).toBe(false);
    selectClip(null);
    expect(selection.value).toEqual([]);
    // Selecting is not an undo step (RULE-13).
    expect(steps()).toBe(0);
  });

  it('F-003.AC1 moving C one place earlier twice gives C, A, B with no gaps, one step each', () => {
    selectClip('C');
    expect(moveSelected('earlier')).toBe(true);
    expect(moveSelected('earlier')).toBe(true);
    expect(ids(project.value)).toEqual(['C', 'A', 'B']);
    expect(layoutOf(project.value).spans[0]!.startFrame).toBe(0);
    expect(steps()).toBe(2);
    // The moved clip stays selected; the first clip can't move earlier.
    expect(selection.value).toEqual(['C']);
    expect(moveSelected('earlier')).toBe(false);
    expect(steps()).toBe(2);
  });

  it('F-003.R2 a drag drops C at the start as one undo step', () => {
    moveClipTo('C', 0);
    expect(ids(project.value)).toEqual(['C', 'A', 'B']);
    expect(steps()).toBe(1);
    undo();
    expect(ids(project.value)).toEqual(['A', 'B', 'C']);
  });

  it('F-003.AC2 deleting B leaves A and C adjacent, the project shorter by B, and nothing selected', () => {
    const before = projectEnd(project.value);
    selectClip('B');
    expect(deleteSelected()).toBe(true);
    expect(ids(project.value)).toEqual(['A', 'C']);
    expect(projectEnd(project.value)).toBe(before - 3 * S);
    expect(selection.value).toEqual([]);
    expect(steps()).toBe(1);
    expect(deleteSelected()).toBe(false);
  });

  it('F-003.AC3 duplicating A (a look, speed 2×) puts a copy with the same look and speed right after it', () => {
    start(proj({ clips: [video('A', 8, { speedPct: 200, look: { id: 'warm', intensity: 80 } }), photo('B', 3)] }));
    selectClip('A');
    expect(duplicateSelected()).toBe(true);
    const [a, copy, b] = project.value.clips;
    expect(b?.id).toBe('B');
    expect(copy?.id).not.toBe('A');
    expect(copy?.speedPct).toBe(200);
    expect(copy?.look).toEqual(a?.look);
    // The original stays selected.
    expect(selection.value).toEqual(['A']);
    expect(steps()).toBe(1);
  });

  it('F-003.AC4 F-003.AC6 F-003.AC7 cross-fades follow RULE-05 through the editor actions', () => {
    start(
      proj({
        clips: [video('A', 4, { crossFadeNext: S / 2 }), video('B', 4, { crossFadeNext: S / 2 }), video('C', 4)],
      }),
    );
    selectClip('B');
    deleteSelected();
    expect(project.value.clips.map((c) => c.crossFadeNext)).toEqual([0, 0]);

    start(proj({ clips: [video('A', 4, { crossFadeNext: S / 2 }), video('B', 4), video('C', 4)] }));
    selectClip('B');
    moveSelected('later');
    expect(ids(project.value)).toEqual(['A', 'C', 'B']);
    expect(project.value.clips[0]!.crossFadeNext).toBe(0);

    start(proj({ clips: [video('A', 4, { crossFadeNext: S / 2 }), video('B', 4)] }));
    selectClip('A');
    duplicateSelected();
    expect(project.value.clips.map((c) => c.crossFadeNext)).toEqual([0, S / 2, 0]);
  });

  it('F-003.AC8 a reorder that would pass 10 minutes is refused with COPY-notice.length_full and no step', () => {
    // 9 min 59.5 s: ten clips whose only cross-fade (1 s, between the first two) keeps the project in.
    const clips = [
      photo('A', 60, { crossFadeNext: S }),
      photo('B', 60),
      ...Array.from({ length: 7 }, (_, i) => photo(`P${i}`, 60)),
      video('V', 60.5),
    ];
    start(proj({ clips }));
    expect(projectEnd(project.value)).toBe(599.5 * S);
    selectClip('B');
    expect(moveSelected('later')).toBe(false);
    expect(ids(project.value)[1]).toBe('B');
    expect(steps()).toBe(0);
    expect(tags()).toEqual(['length_full']);
  });

  it('RULE-03 a duplicate near the limit is shortened with COPY-notice.length_limited', () => {
    start(proj({ clips: [photo('A', 60), ...Array.from({ length: 9 }, (_, i) => photo(`P${i}`, 59))] }));
    // 60 + 9 × 59 = 591 s: a copy of A gets 9 s.
    selectClip('A');
    expect(duplicateSelected()).toBe(true);
    expect(projectEnd(project.value)).toBe(600 * S);
    expect(tags()).toEqual(['length_limited']);
  });

  it('RULE-20 the arrange keys run the same actions and say whether they acted', () => {
    expect(runArrangeAction('delete')).toBe(false);
    selectClip('A');
    expect(runArrangeAction('move-later')).toBe(true);
    expect(ids(project.value)).toEqual(['B', 'A', 'C']);
    expect(runArrangeAction('duplicate')).toBe(true);
    expect(project.value.clips).toHaveLength(4);
    expect(runArrangeAction('delete')).toBe(true);
    expect(project.value.clips).toHaveLength(3);
    expect(runArrangeAction('play-pause')).toBe(false);
  });

  it('RULE-13 after undo of a delete the deleted clip is selected again', () => {
    selectClip('B');
    deleteSelected();
    undo();
    expect(ids(project.value)).toEqual(['A', 'B', 'C']);
    expect(selectedClip.value?.id).toBe('B');
  });
});
