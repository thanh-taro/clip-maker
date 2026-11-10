// MOD-App — undo and redo in the editor (F-014): the toolbar's availability, the RULE-20 history keys'
// actions, and undo during playback (the preview keeps playing the restored project). MOD-Project's
// history itself is tested in project.history.test.ts.
import { beforeEach, describe, expect, it } from 'vitest';
import type { FromEngine, Micros, Project, ToEngine } from '../../src/core';
import { mountPreview, type PreviewEnv } from '../../src/preview';
import {
  deleteItem,
  duplicateClip,
  edit,
  newProject,
  playhead,
  project,
  selection,
  setAdjustments,
} from '../../src/project';
import { historyAvailable, redoEdit, runHistoryAction, undoEdit } from '../../src/app/history';
import { connectPreview } from '../../src/app/playback';
import { S, proj, video } from '../support/project';

const load = (p: Project) => {
  newProject();
  edit(() => ({ project: p, notices: [], changed: [] }));
};

beforeEach(() => newProject());

describe('F-014 undo and redo in the editor', () => {
  it('F-014.R1 CMP-Toolbar Undo and Redo are unavailable with nothing to undo or redo', () => {
    expect(historyAvailable.value).toEqual({ undo: false, redo: false });
    load(proj({ clips: [video('A', 4)] }));
    expect(historyAvailable.value).toEqual({ undo: true, redo: false });
    expect(undoEdit()).toBe(true);
    expect(historyAvailable.value).toEqual({ undo: false, redo: true });
    expect(undoEdit()).toBe(false);
    expect(redoEdit()).toBe(true);
    expect(redoEdit()).toBe(false);
    expect(historyAvailable.value).toEqual({ undo: true, redo: false });
  });

  it('F-014.AC3 after an undo a new edit makes Redo unavailable', () => {
    load(proj({ clips: [video('A', 4)] }));
    edit((p) => setAdjustments(p, 'A', { brightness: 10 }));
    undoEdit();
    expect(historyAvailable.value.redo).toBe(true);
    edit((p) => duplicateClip(p, 'A', () => 'A2'));
    expect(historyAvailable.value.redo).toBe(false);
  });

  it('RULE-20 F-014.R1 the history keys undo and redo, and are taken from the browser even with nothing to undo', () => {
    load(proj({ clips: [video('A', 4), video('B', 2)] }));
    edit((p) => deleteItem(p, 'B'));
    expect(runHistoryAction('undo')).toBe(true);
    expect(project.value.clips).toHaveLength(2);
    expect(selection.value).toEqual(['B']);
    expect(runHistoryAction('redo')).toBe(true);
    expect(project.value.clips).toHaveLength(1);
    expect(runHistoryAction('redo')).toBe(true); // nothing to redo: a no-op, still the tool's key
    expect(runHistoryAction('delete')).toBe(false); // not a history key
  });
});

/** A playing preview on the session's project, with a fake engine and clock. */
function playingPreview() {
  const sent: ToEngine[] = [];
  const frames: (() => void)[] = [];
  const clock = {
    t: 0 as Micros,
    playing: false,
    async play(from: Micros) {
      this.t = from;
      this.playing = true;
    },
    pause() {
      this.playing = false;
    },
    seek(t: Micros) {
      this.t = t;
    },
    now() {
      return this.t;
    },
    onInterrupted: null,
  };
  const env: PreviewEnv = {
    requestFrame: (fn) => frames.push(fn),
    cancelFrame: () => undefined,
    devicePixelRatio: () => 1,
    observeSize: (_el, fn) => {
      fn(640, 360);
      return () => undefined;
    },
    canvasOf: () =>
      ({ style: {}, transferControlToOffscreen: () => ({}), remove: () => undefined }) as unknown as HTMLCanvasElement,
  };
  const engine = {
    postMessage: (m: ToEngine) => sent.push(m),
    addEventListener: (_: 'message', _fn: (e: MessageEvent<FromEngine>) => void) => undefined,
    removeEventListener: () => undefined,
  };
  const ctl = mountPreview({} as HTMLElement, { project }, { engine, clock, env });
  const stop = connectPreview(ctl, { playhead });
  return { ctl, clock, sent, frame: () => frames.splice(0).forEach((f) => f()), stop };
}

describe('F-014 edge case: undo during playback', () => {
  it('F-014.R3 undo during playback keeps playing, with the restored project in the preview', async () => {
    load(proj({ clips: [video('A', 4)] }));
    edit((p) => duplicateClip(p, 'A', () => 'A2'));
    const r = playingPreview();
    r.ctl.toggle();
    await Promise.resolve();
    expect(r.ctl.state.value).toBe('playing');
    r.clock.t = 1 * S;
    r.frame();
    undoEdit();
    expect(r.ctl.state.value).toBe('playing');
    const last = r.sent.filter((m) => m.type === 'engine:setProject').at(-1);
    expect(last && last.type === 'engine:setProject' && last.project).toBe(project.value);
    expect(project.value.clips).toHaveLength(1);
    r.clock.t = 2 * S;
    r.frame();
    expect(r.ctl.state.value).toBe('playing');
    expect(playhead.value).toBe(2 * S);
    r.stop();
    r.ctl.dispose();
  });

  it('F-014.AC5 RULE-13 an undo that ends the project before the playing playhead moves it to the new end', async () => {
    load(proj({ clips: [video('A', 4)] }));
    edit((p) => duplicateClip(p, 'A', () => 'A2'));
    const r = playingPreview();
    r.ctl.toggle();
    await Promise.resolve();
    r.clock.t = 6 * S;
    r.frame();
    expect(playhead.value).toBe(6 * S);
    undoEdit();
    expect(playhead.value).toBe(4 * S);
    expect(r.ctl.time.value).toBe(4 * S);
    expect(selection.value).toEqual([]);
    r.stop();
    r.ctl.dispose();
  });
});
