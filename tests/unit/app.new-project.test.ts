// MOD-App — F-018 warn before losing work: the leave-page warning while there are unexported changes
// (RULE-19) and New project (RULE-23) behind CMP-ConfirmDialog. The dialog itself and the browser's warning
// run in tests/e2e/unexported-warning.spec.ts; MOD-Project's epoch is in project.history.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../src/core';
import {
  canRedo,
  canUndo,
  copiedGrade,
  edit,
  EMPTY_PROJECT,
  exportMark,
  history,
  markExported,
  newProject,
  project,
  redo,
  setAdjustments,
  setAspect,
  setFrameRate,
  undo,
  unexported,
} from '../../src/project';
import type { IntakeResult } from '../../src/media';
import { addFiles, configureAdding, progress, resetAdding } from '../../src/app/adding';
import { device, resetDeviceSession } from '../../src/app/device';
import { chooseResolution, panelOpen, resetExportSession, videoChoice } from '../../src/app/export';
import { notices, resetNotices, showNotice } from '../../src/app/notice-stack';
import { editorLocked } from '../../src/app/lock';
import {
  bindLeaveWarning,
  cancelNewProject,
  confirmNewProject,
  confirmOpen,
  requestNewProject,
  type LeaveTarget,
} from '../../src/app/new-project';
import { proj, video, videoSource } from '../support/project';

const load = (p: Project) => edit(() => ({ project: p, notices: [], changed: [] }));

/** A window stand-in that records its `beforeunload` listeners. */
function fakeWindow() {
  const listeners = new Set<EventListener>();
  const target: LeaveTarget = {
    addEventListener: vi.fn((type: string, fn: EventListener) => {
      if (type === 'beforeunload') listeners.add(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: EventListener) => {
      if (type === 'beforeunload') listeners.delete(fn);
    }),
  };
  /** What the browser would do on leaving: true when a listener asked for the warning. */
  const leave = (): boolean => {
    let warned = false;
    for (const fn of listeners) {
      const e = {
        preventDefault: () => (warned = true),
        returnValue: undefined as unknown,
      };
      fn(e as unknown as Event);
      if (e.returnValue !== undefined) warned = true;
    }
    return warned;
  };
  return { target, listeners, leave };
}

let unbind: (() => void) | null = null;
beforeEach(() => {
  resetDeviceSession();
  device.value = { status: 'supported' };
  resetAdding();
  resetNotices();
  newProject();
  resetExportSession();
  cancelNewProject();
  editorLocked.value = false;
});
afterEach(() => {
  unbind?.();
  unbind = null;
});

describe('F-018.R1 the leave-page warning', () => {
  it('F-018.AC1 RULE-19 an edited, unexported project registers the warning; leaving asks the browser to warn', () => {
    const w = fakeWindow();
    unbind = bindLeaveWarning(w.target);
    expect(w.listeners.size).toBe(0);
    load(proj({ clips: [video('A', 4)] }));
    expect(w.listeners.size).toBe(1);
    expect(w.leave()).toBe(true);
  });

  it('F-018.AC2 RULE-19 a project just exported with no edits since has no warning registered', () => {
    const w = fakeWindow();
    unbind = bindLeaveWarning(w.target);
    load(proj({ clips: [video('A', 4)] }));
    markExported('video', exportMark());
    expect(w.listeners.size).toBe(0);
    expect(w.leave()).toBe(false);
    // An audio export counts as a full-project export too.
    edit((p) => setAdjustments(p, 'A', { brightness: 10 }));
    markExported('audio', exportMark());
    expect(w.listeners.size).toBe(0);
  });

  it('F-018.R1 RULE-19 D-019 a GIF export keeps the warning', () => {
    const w = fakeWindow();
    unbind = bindLeaveWarning(w.target);
    load(proj({ clips: [video('A', 4)] }));
    markExported('gif', exportMark());
    expect(w.listeners.size).toBe(1);
  });

  it('F-018.R1 RULE-19 an edit after an export brings the warning back, and undoing back to the exported state keeps it', () => {
    const w = fakeWindow();
    unbind = bindLeaveWarning(w.target);
    load(proj({ clips: [video('A', 4)] }));
    markExported('video', exportMark());
    edit((p) => setAdjustments(p, 'A', { brightness: 10 }));
    expect(w.listeners.size).toBe(1);
    // RULE-19: an undo step undone since the export is still a change.
    undo();
    expect(unexported.value).toBe(true);
    expect(w.listeners.size).toBe(1);
    redo();
    expect(w.listeners.size).toBe(1);
  });

  it('F-018.R1 RULE-19 an empty project never warns, even after edits', () => {
    const w = fakeWindow();
    unbind = bindLeaveWarning(w.target);
    load(proj({ clips: [video('A', 4)] }));
    undo();
    expect(project.value.clips).toHaveLength(0);
    expect(w.listeners.size).toBe(0);
  });

  it('F-018.R1 unbinding removes the warning', () => {
    const w = fakeWindow();
    unbind = bindLeaveWarning(w.target);
    load(proj({ clips: [video('A', 4)] }));
    unbind();
    unbind = null;
    expect(w.listeners.size).toBe(0);
  });
});

describe('F-018.R2 New project', () => {
  it('F-018.AC3 with unexported changes New project asks first; on cancel nothing changes', () => {
    load(proj({ clips: [video('A', 4)] }));
    const before = project.value;
    const steps = history.value;
    expect(requestNewProject()).toBe('asking');
    expect(confirmOpen.value).toBe(true);
    expect(project.value).toBe(before);
    cancelNewProject();
    expect(confirmOpen.value).toBe(false);
    expect(project.value).toBe(before);
    expect(history.value).toBe(steps);
    expect(unexported.value).toBe(true);
  });

  it('F-018.AC5 with no unexported changes New project starts at once', () => {
    load(proj({ clips: [video('A', 4)] }));
    markExported('video', exportMark());
    expect(requestNewProject()).toBe('started');
    expect(confirmOpen.value).toBe(false);
    expect(project.value).toBe(EMPTY_PROJECT);
    // An empty project has nothing to lose either.
    expect(requestNewProject()).toBe('started');
    expect(confirmOpen.value).toBe(false);
  });

  it('F-018.AC4 F-018.R3 RULE-23 confirmed: empty, no undo, Original at 30 fps with detection on, no paste, export resolution kept', () => {
    load(proj({ clips: [video('A', 4)] }));
    edit((p) => setFrameRate(p, 60));
    edit((p) => setAspect(p, '9:16'));
    copiedGrade.value = { adjustments: { brightness: 10 }, look: null };
    chooseResolution(720);
    const choice = videoChoice.value;
    expect(requestNewProject()).toBe('asking');
    confirmNewProject();
    expect(confirmOpen.value).toBe(false);
    expect(project.value).toBe(EMPTY_PROJECT);
    expect(project.value.sources).toEqual([]);
    expect(project.value.clips).toEqual([]);
    expect(project.value.frame).toEqual({ aspect: 'original', frameRate: 30, background: 'black' });
    expect(project.value.frame.frameRateChosen).toBeUndefined(); // RULE-04 detection is on again
    expect(canUndo.value).toBe(false);
    expect(canRedo.value).toBe(false);
    expect(copiedGrade.value).toBeNull();
    expect(videoChoice.value).toBe(choice);
    expect(videoChoice.value.resolution).toBe(720);
    expect(unexported.value).toBe(false);
  });

  it('F-018.R3 RULE-23 a new project closes an open export panel (its settings are kept)', () => {
    load(proj({ clips: [video('A', 4)] }));
    markExported('video', exportMark());
    panelOpen.value = true;
    requestNewProject();
    expect(panelOpen.value).toBe(false);
  });

  it('F-018.R2 SCR-Editor exporting: while the editor is locked New project does nothing', () => {
    load(proj({ clips: [video('A', 4)] }));
    const before = project.value;
    editorLocked.value = true;
    expect(requestNewProject()).toBe('locked');
    expect(confirmOpen.value).toBe(false);
    confirmNewProject();
    expect(project.value).toBe(before);
  });

  it('F-018.R2 confirming when nothing is asked does nothing', () => {
    load(proj({ clips: [video('A', 4)] }));
    const before = project.value;
    confirmNewProject();
    expect(project.value).toBe(before);
  });

  /**
   * A fake MOD-Media intake: each batch's result waits for `finish()`; every checked file is "accepted"
   * (a 3 s video), and `released` records what the controller gave back to the registry.
   */
  function heldIntake() {
    const released: string[] = [];
    let finish: () => void = () => undefined;
    let started = 0;
    let n = 0;
    configureAdding({
      intake: (items, onProgress) => {
        started++;
        onProgress({ position: 1, total: items.length } as never);
        const accepted = (items as File[]).map((f) => ({
          source: videoSource(`s${++n}`, 3, { name: f.name }),
          file: f,
        }));
        return new Promise<IntakeResult>((resolve) => {
          finish = () => resolve({ accepted, refused: [], notices: [], cancelled: false } as unknown as IntakeResult);
        });
      },
      release: (id) => released.push(id),
    });
    return { released, finish: () => finish(), started: () => started };
  }
  const fileNamed = (name: string) => new File([new Uint8Array(1)], name);

  it('F-018.R3 RULE-23 confirmed while a batch is held: the batch is dropped, the project stays empty and its checked file is released', async () => {
    load(proj({ clips: [video('A', 4)] }));
    const h = heldIntake();
    const batch = addFiles([fileNamed('late.mp4')]);
    await expect.poll(() => h.started()).toBe(1);
    expect(requestNewProject()).toBe('asking');
    confirmNewProject();
    h.finish();
    await batch;
    expect(project.value).toBe(EMPTY_PROJECT);
    expect(h.released).toEqual(['s1']);
    expect(progress.value).toBeNull();
  });

  it('F-018.R3 RULE-23 a batch that lands while the dialog is open is removed on confirm', async () => {
    load(proj({ clips: [video('A', 4)] }));
    const h = heldIntake();
    const batch = addFiles([fileNamed('mid.mp4')]);
    await expect.poll(() => h.started()).toBe(1);
    expect(requestNewProject()).toBe('asking');
    h.finish();
    await batch;
    expect(project.value.sources.map((x) => x.name)).toContain('mid.mp4');
    confirmNewProject();
    expect(project.value).toBe(EMPTY_PROJECT);
    expect(canUndo.value).toBe(false);
  });

  it('F-018.R3 RULE-23 a new project closes the old project’s notices; a progress notice is left to its owner', () => {
    load(proj({ clips: [video('A', 4)] }));
    markExported('video', exportMark());
    showNotice({ kind: 'success', tag: 'added', text: () => 'added' });
    showNotice({ kind: 'warning', tag: 'length_full', text: () => 'full' });
    showNotice({ kind: 'error', tag: 'refused_list', text: () => 'refused' });
    showNotice({ kind: 'progress', tag: 'other-progress', text: () => 'busy' });
    expect(notices.value).toHaveLength(4);
    requestNewProject();
    expect(notices.value.map((n) => n.kind)).toEqual(['progress']);
  });
});
