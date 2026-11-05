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
  endGesture,
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
  it('F-014.AC1 undoing a split, a look change and an added text restores the project; redoing brings all three back', () => {
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

  it('F-014.AC4 a slider dragged through many values is undone in one step', () => {
    load(proj({ clips: [video('A', 10)] }));
    const before = project.value;
    beginGesture('slider:brightness');
    for (let v = 1; v <= 40; v++) edit((p) => setAdjustments(p, 'A', { brightness: v }));
    endGesture();
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

  it('F-014.AC6 a new text layer typed in and finished is removed by one undo', () => {
    load(proj({ clips: [video('A', 10)] }));
    const before = project.value;
    beginGesture('text-edit');
    edit((p) => addText(p, 0, nextId));
    const id = project.value.textLayers[0]!.id;
    edit((p) => editText(p, id, 'H'));
    edit((p) => editText(p, id, 'Hi'));
    edit((p) => finishText(p, id));
    endGesture();
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
    beginGesture('text-edit');
    edit((p) => addText(p, 0, nextId));
    edit((p) => finishText(p, p.textLayers[0]!.id));
    endGesture();
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
