// MOD-App — the editor's polite announcements (F-017.R7): edits name themselves in the active language, and undo
// and redo say which step they undid or redid. The DOM region is checked end to end (keyboard-touch.spec.ts).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { language, translate } from '../../src/copy';
import { EMPTY_HISTORY, history, playhead, project, selection } from '../../src/project';
import { announce, announcement } from '../../src/app/announce';
import { deleteSelected, duplicateSelected, moveSelected, runArrangeAction, selectClip } from '../../src/app/arrange';
import { redoEdit, undoEdit } from '../../src/app/history';
import { resetNotices } from '../../src/app/notice-stack';
import { splitHere } from '../../src/app/trim';
import { S, audio, photo, proj, text, video } from '../support/project';

const said = () => announcement.value.replace(/ $/, '');

describe('F-017.R7 announcements', () => {
  beforeEach(() => {
    project.value = proj({ clips: [video('A', 4), photo('B', 3), video('C', 5)] });
    history.value = EMPTY_HISTORY;
    selection.value = [];
    playhead.value = 0;
    announcement.value = '';
    resetNotices();
  });
  afterEach(() => {
    language.value = 'en-US';
  });

  it('F-017.AC9 split, duplicate, move earlier and delete of the selected clip are each announced', () => {
    selectClip('B');
    playhead.value = 5 * S;
    expect(splitHere()).toBe(true);
    expect(said()).toBe('Split at 0:05');
    expect(duplicateSelected()).toBe(true);
    expect(said()).toBe('Duplicated src-B.jpg');
    expect(moveSelected('earlier')).toBe(true);
    expect(said()).toBe('Moved src-B.jpg to place 1 of 5');
    expect(deleteSelected()).toBe(true);
    expect(said()).toBe('Deleted src-B.jpg');
  });

  it('F-017.AC9 a text layer or audio clip move says its new start time; a refused edit says nothing', () => {
    project.value = proj({ clips: [video('A', 10)], textLayers: [text('Hello', 2, 4)], audioClips: [audio('M', 0, 3)] });
    selectClip('Hello');
    runArrangeAction('move-later-second');
    expect(said()).toBe('Moved Hello to 0:03');
    selectClip('A');
    announcement.value = '';
    // A clip alone can't move: nothing changes, nothing is said.
    expect(moveSelected('earlier')).toBe(false);
    expect(said()).toBe('');
  });

  it('F-017.AC10 undo and redo name the step they undid and redid; an unnamed step is the last edit', () => {
    playhead.value = 2 * S;
    expect(splitHere()).toBe(true);
    expect(undoEdit()).toBe(true);
    expect(said()).toBe(`Undone: ${translate('en-US', 'action.split')}`);
    expect(redoEdit()).toBe(true);
    expect(said()).toBe(`Redone: ${translate('en-US', 'action.split')}`);
    selectClip('C');
    moveSelected('earlier');
    undoEdit();
    expect(said()).toBe('Undone: Move earlier');
    // A step made elsewhere (no action name recorded).
    history.value = { past: [{ before: project.value, after: project.value, changed: [], gesture: null }], future: [] };
    undoEdit();
    expect(said()).toBe('Undone: last edit');
  });

  it('F-017.AC10 announcements follow the active language (vi-VN)', () => {
    language.value = 'vi-VN';
    playhead.value = 2 * S;
    splitHere();
    expect(said()).toBe('Đã tách tại 0:02');
    undoEdit();
    expect(said()).toBe('Đã hoàn tác: Tách');
  });

  it('F-017.R7 the same message twice in a row still changes the region, so it is read again', () => {
    announce('Playing');
    const first = announcement.value;
    announce('Playing');
    expect(announcement.value).not.toBe(first);
    expect(announcement.value.trim()).toBe('Playing');
  });
});
