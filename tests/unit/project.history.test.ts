// MOD-Project history (RULE-13, ADR-0011), the change epoch (RULE-19) and New project (RULE-23).
import { beforeEach, describe, expect, it } from 'vitest';
import { projectEnd, type Project } from '../../src/core';
import {
  EMPTY_PROJECT,
  addText,
  beginGesture,
  canRedo,
  canUndo,
  copiedGrade,
  deleteItem,
  edit,
  editText,
  finishText,
  markExported,
  muteOriginal,
  newProject,
  playhead,
  project,
  redo,
  selection,
  setAdjustments,
  setFrameRate,
  setLook,
  setAspect,
  splitAt,
  undo,
  unexported,
} from '../../src/project';
import { S, proj, video } from '../support/project';

let n = 0;
const nextId = () => `id-${++n}`;
const load = (p: Project) => {
  newProject();
  edit(() => ({ project: p, notices: [], changed: [] }));
};

beforeEach(() => {
  newProject();
  n = 0;
});

describe('F-014 undo and redo', () => {
  it('F-014.AC1 undoing a split, a look change and an added text restores the project; redoing brings all three back (their controls wait for F-004, F-008, F-010)', () => {
    load(proj({ clips: [video('A', 10)] }));
    const before = project.value;
    edit((p) => splitAt(p, 'A', 4 * S, nextId));
    edit((p) => setLook(p, 'A', { id: 'film-warm', intensity: 100 }));
    edit((p) => addText(p, 0, nextId));
    const after = project.value;
    undo();
    undo();
    undo();
    expect(project.value).toBe(before);
    redo();
    redo();
    redo();
    expect(project.value).toBe(after);
  });

  it('F-014.AC2 of 250 edits at least 200 can be undone', () => {
    load(proj({ clips: [video('A', 10)] }));
    for (let i = 1; i <= 250; i++) edit((p) => setAdjustments(p, 'A', { brightness: (i % 200) - 100 || 1 }));
    let undone = 0;
    while (canUndo.value) {
      undo();
      undone++;
    }
    expect(undone).toBeGreaterThanOrEqual(200);
  });

  it('F-014.AC3 a new edit after an undo makes redo unavailable', () => {
    load(proj({ clips: [video('A', 10)] }));
    edit((p) => setAdjustments(p, 'A', { brightness: 10 }));
    undo();
    expect(canRedo.value).toBe(true);
    edit((p) => setAdjustments(p, 'A', { contrast: 10 }));
    expect(canRedo.value).toBe(false);
  });

  it('F-014.AC4 a slider dragged through many values is undone in one step (the sliders wait for F-005/F-006/F-007)', () => {
    load(proj({ clips: [video('A', 10)] }));
    const before = project.value;
    const g = beginGesture();
    for (let v = 1; v <= 40; v++) g.edit((p) => setAdjustments(p, 'A', { brightness: v }));
    g.end();
    expect(project.value.clips[0]!.adjustments).toEqual({ brightness: 40 });
    undo();
    expect(project.value).toBe(before);
  });

  it('F-014.AC5 undoing a delete selects the restored clip; undoing the add of the last clip limits the playhead to the end', () => {
    load(proj({ clips: [video('A', 10), video('B', 5)] }));
    edit((p) => deleteItem(p, 'B'));
    selection.value = [];
    undo();
    expect(selection.value).toEqual(['B']);

    load(proj({ clips: [video('A', 10)] }));
    edit((p) => ({ project: { ...p, clips: [...p.clips, video('B', 5)] }, notices: [], changed: ['B'] }));
    playhead.value = 14 * S;
    undo();
    expect(selection.value).toEqual([]);
    expect(playhead.value).toBe(projectEnd(project.value));
    expect(playhead.value).toBe(10 * S);
  });

  it('F-014.AC6 a new text layer typed in and finished is removed by one undo (CMP-TextEditor waits for F-010)', () => {
    load(proj({ clips: [video('A', 10)] }));
    const before = project.value;
    const g = beginGesture();
    g.edit((p) => addText(p, 0, nextId));
    const id = project.value.textLayers[0]!.id;
    g.edit((p) => editText(p, id, 'H'));
    g.edit((p) => editText(p, id, 'Hi'));
    g.edit((p) => finishText(p, id));
    g.end();
    expect(project.value.textLayers[0]!.content).toBe('Hi');
    undo();
    expect(project.value).toBe(before);
    expect(canUndo.value).toBe(true);
  });

  it('RULE-13 adding text and removing it empty in one session leaves no undo step', () => {
    load(proj({ clips: [video('A', 10)] }));
    const steps = canUndo.value;
    undo();
    expect(canUndo.value).toBe(false);
    expect(steps).toBe(true);
    const g = beginGesture();
    g.edit((p) => addText(p, 0, nextId));
    g.edit((p) => finishText(p, p.textLayers[0]!.id));
    g.end();
    expect(canUndo.value).toBe(false);
  });

  it('F-012.AC4 switching 9:16 to 1:1 and undoing gives 9:16 with every item unchanged', () => {
    load(proj({ clips: [video('A', 10)] }));
    edit((p) => setAspect(p, '9:16'));
    const before = project.value;
    edit((p) => setAspect(p, '1:1'));
    undo();
    expect(project.value).toBe(before);
    expect(project.value.frame.aspect).toBe('9:16');
  });

  it('F-011.AC4 one undo unmutes all three clips muted by mute original sound', () => {
    load(proj({ clips: [video('A', 2), video('B', 2), video('C', 2)] }));
    edit((p) => muteOriginal(p));
    expect(project.value.clips.every((c) => c.muted)).toBe(true);
    undo();
    expect(project.value.clips.some((c) => c.muted)).toBe(false);
  });

  it('RULE-12 a move that changes nothing records no undo step (F-011.AC9 domain)', () => {
    load(proj({ clips: [video('A', 10)] }));
    undo();
    edit((p) => ({ project: p, notices: [], changed: [] }));
    expect(canUndo.value).toBe(false);
  });
});

describe('RULE-13 gestures, selection and playhead after undo or redo', () => {
  it('RULE-13 an edit made outside an open gesture (a batch finishing during a slider drag) stays its own step', () => {
    load(proj({ clips: [video('A', 10), video('B', 4)] }));
    const g = beginGesture();
    g.edit((p) => setAdjustments(p, 'A', { brightness: 10 }));
    edit((p) => deleteItem(p, 'B'));
    g.edit((p) => setAdjustments(p, 'A', { brightness: 20 }));
    g.end();
    undo();
    expect(project.value.clips[0]!.adjustments).toEqual({ brightness: 10 });
    undo();
    expect(project.value.clips.map((c) => c.id)).toEqual(['A', 'B']);
    undo();
    expect(project.value.clips[0]!.adjustments).toEqual({});
  });

  it('RULE-13 after an undo an open gesture starts a new step; an ended gesture records separate steps', () => {
    load(proj({ clips: [video('A', 10)] }));
    const g = beginGesture();
    g.edit((p) => setAdjustments(p, 'A', { brightness: 10 }));
    undo();
    redo();
    g.edit((p) => setAdjustments(p, 'A', { brightness: 20 }));
    undo();
    expect(project.value.clips[0]!.adjustments).toEqual({ brightness: 10 });
    redo();
    g.end();
    g.edit((p) => setAdjustments(p, 'A', { brightness: 30 }));
    g.edit((p) => setAdjustments(p, 'A', { brightness: 40 }));
    undo();
    expect(project.value.clips[0]!.adjustments).toEqual({ brightness: 30 });
  });

  it('RULE-13 two gestures never merge, even back to back', () => {
    load(proj({ clips: [video('A', 10)] }));
    const a = beginGesture();
    a.edit((p) => setAdjustments(p, 'A', { brightness: 10 }));
    a.end();
    const b = beginGesture();
    b.edit((p) => setAdjustments(p, 'A', { brightness: 20 }));
    b.end();
    undo();
    expect(project.value.clips[0]!.adjustments).toEqual({ brightness: 10 });
  });

  it('RULE-13 after undo or redo the item the step changed is selected if it still exists, otherwise nothing', () => {
    load(proj({ clips: [video('A', 10), video('B', 4)] }));
    edit((p) => setLook(p, 'A', { id: 'film-warm', intensity: 100 }));
    selection.value = ['B'];
    undo();
    expect(selection.value).toEqual(['A']);
    selection.value = [];
    redo();
    expect(selection.value).toEqual(['A']);
    // A redone delete: the clip no longer exists, so nothing is selected.
    edit((p) => deleteItem(p, 'B'));
    undo();
    expect(selection.value).toEqual(['B']);
    redo();
    expect(selection.value).toEqual([]);
    // A frame change changes no item: nothing is selected.
    selection.value = ['A'];
    edit((p) => setAspect(p, '9:16'));
    undo();
    expect(selection.value).toEqual([]);
  });

  it('RULE-13 after redo the playhead is limited to the project end; a playhead inside the project stays', () => {
    load(proj({ clips: [video('A', 10), video('B', 5)] }));
    edit((p) => deleteItem(p, 'B'));
    undo();
    playhead.value = 12 * S;
    redo();
    expect(playhead.value).toBe(10 * S);
    playhead.value = 3 * S;
    undo();
    expect(playhead.value).toBe(3 * S);
  });

  it('RULE-13 F-014.R1 undo and redo with nothing to undo or redo change nothing', () => {
    load(proj({ clips: [video('A', 10)] }));
    markExported('video');
    const p = project.value;
    redo();
    expect(project.value).toBe(p);
    expect(unexported.value).toBe(false);
    undo();
    undo();
    expect(canUndo.value).toBe(false);
    const empty = project.value;
    undo();
    expect(project.value).toBe(empty);
  });

  it('F-014.R2 RULE-13 the history keeps the last 200 steps: the oldest are dropped first', () => {
    load(proj({ clips: [video('A', 10)] }));
    for (let i = 1; i <= 205; i++) edit((p) => setAdjustments(p, 'A', { brightness: i % 100 || 100 }));
    let n = 0;
    while (canUndo.value) {
      undo();
      n++;
    }
    expect(n).toBe(200);
    // Six steps beyond the depth were dropped (the load step and edits 1–5): edit 5's result remains.
    expect(project.value.clips[0]!.adjustments).toEqual({ brightness: 5 });
  });
});

describe('RULE-19 unexported changes and RULE-23 new project', () => {
  it('RULE-19 an edit makes changes unexported; a video export clears them, a GIF export does not', () => {
    load(proj({ clips: [video('A', 10)] }));
    expect(unexported.value).toBe(true);
    markExported('gif');
    expect(unexported.value).toBe(true);
    markExported('video');
    expect(unexported.value).toBe(false);
    edit((p) => setAdjustments(p, 'A', { brightness: 5 }));
    markExported('audio');
    expect(unexported.value).toBe(false);
    undo();
    expect(unexported.value).toBe(true);
  });

  it('F-018.AC4 a new project is empty, has no undo, Original at 30 fps with detection on, and no copied adjustments', () => {
    load(proj({ clips: [video('A', 10)] }));
    edit((p) => setFrameRate(p, 60));
    edit((p) => setAspect(p, '9:16'));
    copiedGrade.value = { adjustments: { brightness: 10 }, look: null };
    newProject();
    expect(project.value).toBe(EMPTY_PROJECT);
    expect(project.value.frame).toEqual({ aspect: 'original', frameRate: 30, background: 'black' });
    expect(canUndo.value).toBe(false);
    expect(canRedo.value).toBe(false);
    expect(copiedGrade.value).toBeNull();
    expect(unexported.value).toBe(false);
  });
});
