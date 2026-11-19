// MOD-App — text layers in the editor (F-010): the editing session as one RULE-13 step, its behaviour when an
// outside edit, undo or New project cuts it (Q96), the character limit on insertion (RULE-11), and the actions
// behind the inspector, the Text tab, the timeline and the RULE-20 keys. The rule maths itself is tested in
// project.items.test.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import { characterCount, frameStart, type Project } from '../../src/core';
import {
  EMPTY_HISTORY,
  edit,
  history,
  newProject,
  playhead,
  project,
  selection,
  setBackground,
  undo,
} from '../../src/project';
import { runArrangeAction } from '../../src/app/arrange';
import {
  addTextAndEdit,
  beginTextDrag,
  deleteSelectedText,
  duplicateSelectedText,
  editLayer,
  editingText,
  finishEditing,
  insertWithin,
  moveTextBy,
  nudgeText,
  resetText,
  restack,
  styleText,
  textAtDefaults,
  typeText,
} from '../../src/app/text';
import { notices, resetNotices } from '../../src/app/notice-stack';
import { S, proj, text, video } from '../support/project';

function start(p: Project): void {
  finishEditing();
  project.value = p;
  history.value = EMPTY_HISTORY;
  selection.value = [];
  playhead.value = 0;
  resetNotices();
}
const steps = () => history.value.past.length;
const layers = () => project.value.textLayers;
const at = (seconds: number) => (playhead.value = Math.round(seconds * S));

describe('F-010 the editing session (CMP-TextEditor)', () => {
  beforeEach(() => start(proj({ clips: [video('A', 10)] })));

  it('F-010.AC1 RULE-13 adding text at 2 s and typing "Đà Lạt 2026" is one step: a 2–5 s layer, selected, being edited', () => {
    at(2);
    expect(addTextAndEdit()).toBe(true);
    const id = editingText.value!;
    expect(selection.value).toEqual([id]);
    for (const n of [1, 2, 3, 6, 11]) typeText('Đà Lạt 2026'.slice(0, n));
    finishEditing();
    expect(editingText.value).toBeNull();
    expect(layers()).toHaveLength(1);
    const t = layers()[0]!;
    expect([t.content, t.start, t.end, t.typeface, t.colour, t.style, t.x, t.y]).toEqual([
      'Đà Lạt 2026',
      2 * S,
      5 * S,
      'sans',
      'white',
      'outline',
      0.5,
      0.8,
    ]);
    expect(steps()).toBe(1);
    undo();
    expect(layers()).toEqual([]);
  });

  it('F-010.AC9 in an empty project the new layer runs from 0 to 3 s', () => {
    start(proj({}));
    addTextAndEdit();
    typeText('Hi');
    finishEditing();
    expect([layers()[0]!.start, layers()[0]!.end]).toEqual([0, 3 * S]);
  });

  it('F-010.AC8 RULE-11 RULE-13 a layer of only spaces is removed when editing ends, within the same step', () => {
    addTextAndEdit();
    typeText('   ');
    finishEditing();
    expect(layers()).toEqual([]);
    expect(selection.value).toEqual([]);
    // Adding then removing leaves the project as it was: no step (F-014.AC6's session leaves nothing behind).
    expect(steps()).toBe(0);
  });

  it('RULE-13 each later editing session is one step', () => {
    addTextAndEdit();
    typeText('Hi');
    finishEditing();
    const id = layers()[0]!.id;
    editLayer(id);
    typeText('Hi!');
    typeText('Hi!!');
    finishEditing();
    expect(steps()).toBe(2);
    undo();
    expect(layers()[0]!.content).toBe('Hi');
  });

  it('RULE-13 a style chosen from the editor while editing joins the session’s step', () => {
    addTextAndEdit();
    const id = editingText.value!;
    typeText('Hi');
    styleText(id, { typeface: 'display' });
    typeText('Hi!');
    finishEditing();
    expect(steps()).toBe(1);
    expect(layers()[0]).toMatchObject({ content: 'Hi!', typeface: 'display' });
  });

  it('Q96 F-014 an outside edit (a media batch landing) cuts the session: what was typed stays its own step and typing goes on', () => {
    addTextAndEdit();
    const id = editingText.value!;
    typeText('Hel');
    // A batch lands (a plain edit outside the session).
    edit((p) => setBackground(p, 'red'));
    expect(editingText.value).toBe(id);
    typeText('Hello');
    finishEditing();
    expect(layers()[0]!.content).toBe('Hello');
    expect(steps()).toBe(3);
    undo();
    expect(layers()[0]!.content).toBe('Hel');
    expect(project.value.frame.background).toBe('red');
  });

  it('Q96 F-014 a cut that removes the layer (New project) closes the editor with no stale id; typing does nothing', () => {
    addTextAndEdit();
    typeText('Hi');
    newProject();
    expect(editingText.value).toBeNull();
    typeText('Hi there');
    finishEditing();
    expect(layers()).toEqual([]);
    expect(steps()).toBe(0);
  });

  it('F-010 edge case: at 50 layers nothing is added and COPY-notice.text_limit shows', () => {
    start(proj({ textLayers: Array.from({ length: 50 }, (_, i) => text(`T${i}`, 0, 3)) }));
    expect(addTextAndEdit()).toBe(false);
    expect(editingText.value).toBeNull();
    expect(layers()).toHaveLength(50);
    expect(notices.value.map((n) => n.tag)).toEqual(['text_limit']);
  });

  it('CMP-TextEditor editing a layer whose time is not at the playhead moves the playhead into it', () => {
    start(proj({ clips: [video('A', 10)], textLayers: [text('T', 4, 6, { fade: true })] }));
    editLayer('T');
    expect(playhead.value).toBe(frameStart(129, 30));
    finishEditing();
  });
});

describe('F-010 the character limit (RULE-11, F-010.R6)', () => {
  it('F-010.AC6 pasting 20 characters (with Vietnamese tone marks) into 495 adds only 5, none split', () => {
    const value = 'a'.repeat(495);
    // Decomposed input (e + combining marks) is composed (NFC) and counted per user-perceived character.
    const paste = 'ệ'.normalize('NFD').repeat(3) + 'Đà Lạt 2026 ok';
    const r = insertWithin(value, 495, 495, paste)!;
    expect(characterCount(r.value)).toBe(500);
    expect(r.value.slice(495)).toBe('ệệệĐà');
    expect(r.value).toBe(r.value.normalize('NFC'));
    expect(r.caret).toBe(r.value.length);
  });

  it('RULE-11 at 500 characters typing is not accepted; replacing a selection makes room', () => {
    const full = 'b'.repeat(500);
    expect(insertWithin(full, 500, 500, 'x')).toBeNull();
    expect(insertWithin(full, 0, 2, 'xyz')!.value).toBe('xy' + 'b'.repeat(498));
  });
});

describe('F-010 text actions', () => {
  beforeEach(() =>
    start(proj({ clips: [video('A', 10)], textLayers: [text('T', 2, 5), text('U', 3, 6, { content: 'other' })] })),
  );

  it('F-010.AC10 RULE-20 Alt+Right moves the selected text layer one frame later; Shift+Alt 1 s', () => {
    selection.value = ['T'];
    expect(runArrangeAction('move-later')).toBe(true);
    expect(layers()[0]!.start).toBe(frameStart(61, 30));
    runArrangeAction('move-earlier-second');
    expect(layers()[0]!.start).toBe(frameStart(31, 30));
    expect(moveTextBy(-1)).toBe(true);
    expect([layers()[0]!.start, layers()[0]!.end]).toEqual([1 * S, 4 * S]);
  });

  it('F-010.AC7 sending the top layer back puts the other on top; one step', () => {
    selection.value = ['U'];
    expect(restack('U', 'back')).toBe(true);
    expect(layers().map((t) => t.id)).toEqual(['U', 'T']);
    expect(steps()).toBe(1);
    expect(restack('U', 'back')).toBe(false);
  });

  it('F-010.AC12 duplicating a layer and deleting the original leaves one with the same content and times', () => {
    selection.value = ['T'];
    expect(duplicateSelectedText()).toBe(true);
    const copy = selection.value[0]!;
    expect(copy).not.toBe('T');
    selection.value = ['T'];
    expect(deleteSelectedText()).toBe(true);
    const left = layers().filter((t) => t.content === 'T');
    expect(left).toHaveLength(1);
    expect([left[0]!.id, left[0]!.start, left[0]!.end]).toEqual([copy, 2 * S, 5 * S]);
    // Drawn on top: the copy came after U.
    expect(layers().map((t) => t.id)).toEqual(['U', copy]);
  });

  it('RULE-20 T adds a text layer and opens the editor; Delete and Mod+D act on a selected text layer', () => {
    expect(runArrangeAction('add-text')).toBe(true);
    expect(editingText.value).not.toBeNull();
    finishEditing();
    expect(layers()).toHaveLength(2);
    selection.value = ['U'];
    expect(runArrangeAction('delete')).toBe(true);
    expect(layers().map((t) => t.id)).toEqual(['T']);
  });

  it('F-010.AC2 RULE-11 style changes are one step each; size stays within 2–20 %; Reset returns the defaults', () => {
    styleText('T', { typeface: 'display' });
    styleText('T', { size: 10, colour: 'yellow', style: 'box' });
    styleText('T', { size: 40 });
    expect(layers()[0]).toMatchObject({ typeface: 'display', size: 20, colour: 'yellow', style: 'box' });
    expect(steps()).toBe(3);
    expect(textAtDefaults(layers()[0]!)).toBe(false);
    resetText('T');
    expect(textAtDefaults(layers()[0]!)).toBe(true);
    expect(layers()[0]).toMatchObject({ content: 'T', start: 2 * S, end: 5 * S });
  });

  it('Q104 RULE-11 the default box colour is not stored', () => {
    styleText('T', { style: 'box', boxColour: 'red' });
    expect(layers()[0]!.boxColour).toBe('red');
    styleText('T', { boxColour: 'black' });
    expect('boxColour' in layers()[0]!).toBe(false);
  });

  it('F-010.R3 the position nudges move the centre 1 % (Shift: 10 %), within the frame', () => {
    nudgeText('T', 'left');
    nudgeText('T', 'up', true);
    expect([layers()[0]!.x, layers()[0]!.y]).toEqual([0.49, 0.7]);
    for (let i = 0; i < 5; i++) nudgeText('T', 'down', true);
    expect(layers()[0]!.y).toBe(1);
  });

  it('F-010.R3 RULE-13 Q104 a preview drag is one step; back where it began leaves none; Esc puts it back', () => {
    const d = beginTextDrag('T', () => undefined);
    d.set({ x: 0.2 });
    d.set({ x: 0.3, y: 0.4 });
    d.end();
    expect([layers()[0]!.x, layers()[0]!.y, steps()]).toEqual([0.3, 0.4, 1]);
    const back = beginTextDrag('T', () => undefined);
    back.set({ x: 0.6 });
    back.set({ x: 0.3, y: 0.4 });
    back.end();
    expect(steps()).toBe(1);
    const esc = beginTextDrag('T', () => undefined);
    esc.set({ x: 0.9 });
    esc.cancel();
    expect([layers()[0]!.x, steps()]).toEqual([0.3, 1]);
  });
});
