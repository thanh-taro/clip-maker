// MOD-Project — immutable document, edit operations, history, unexported state
// (specs/40-technical/modules/MOD-Project.md, ADR-0011). Imports only MOD-Core (and signals).
// The session's project lives in signals; every edit is a pure operation (ops.ts) committed here as
// one RULE-13 step (coalesced inside a gesture).
import { batch, computed, signal } from '@preact/signals';
import { projectEnd, type Micros, type Notice, type Project } from '../core';
import { EMPTY_HISTORY, record, redoStep, undoStep, type History, type Step } from './history';
import type { EditResult, Grade } from './ops';

export * from './ops';
export { HISTORY_DEPTH, EMPTY_HISTORY, record, undoStep, redoStep, type History, type Step } from './history';

/** The project of a new session: RULE-04 defaults (Original aspect, 30 fps, black background). */
export const EMPTY_PROJECT: Project = Object.freeze({
  frame: Object.freeze({ aspect: 'original', frameRate: 30, background: 'black' }),
  sources: Object.freeze([]),
  clips: Object.freeze([]),
  textLayers: Object.freeze([]),
  audioClips: Object.freeze([]),
}) as Project;

export const project = signal<Project>(EMPTY_PROJECT);
export const history = signal<History>(EMPTY_HISTORY);
export const playhead = signal<Micros>(0);
export const selection = signal<readonly string[]>([]);
/** RULE-08 copied adjustments and look (not an undo step; cleared by New project, RULE-23). */
export const copiedGrade = signal<Grade | null>(null);

/** RULE-19 / ADR-0011 §5: bumped by every do, undo and redo. */
const epoch = signal(0);
const exportedEpoch = signal(0);

/** SCR-Editor "empty": no clips, text or audio. */
export const isEmpty = computed(
  () =>
    project.value.clips.length === 0 && project.value.textLayers.length === 0 && project.value.audioClips.length === 0,
);
export const canUndo = computed(() => history.value.past.length > 0);
export const canRedo = computed(() => history.value.future.length > 0);
/** Implements: RULE-19 unexported changes. */
export const unexported = computed(() => !isEmpty.value && epoch.value !== exportedEpoch.value);

let gestureCounter = 0;
/**
 * Bumped by undo, redo, New project and any edit made outside a gesture that changed the project (a media
 * batch landing, a key): a gesture open across them starts a new step afterwards, from the project as it
 * now is (build question 96).
 */
let historyCut = 0;

/** Called when undo, redo, New project or another edit cut the open gestures (their owners close or refresh). */
const cutListeners = new Set<() => void>();
function cutGestures(): void {
  for (const fn of [...cutListeners]) fn();
}

/** An open gesture's coalescing state. */
interface GestureState {
  token: number;
  cut: number;
  /** The change epoch before the gesture's current step (RULE-19). */
  startEpoch: number | null;
}

/**
 * One continuous drag, slider movement or text editing session (RULE-13). Edits made through `edit`
 * coalesce into a single undo step until `end`; edits made elsewhere meanwhile (a batch of media
 * finishing, a key) stay their own steps, and the gesture's next edit then starts a new step.
 */
export interface Gesture {
  /** Applies an operation as part of this gesture's one step. */
  edit(op: (p: Project) => EditResult): readonly Notice[];
  /** The gesture is over: later edits through it are separate steps, like plain `edit`. */
  end(): void;
  /**
   * False once the gesture has ended or been cut by undo, redo, New project or an edit made outside it. An owner that sees it
   * false (or gets `onCut`) must close or refresh what it shows (a text editor, a slider's value).
   */
  readonly active: boolean;
}

/**
 * Implements: RULE-13 (one continuous drag or slider movement, or adding a text layer plus typing until
 * editing ends, is one step), F-014.AC4/AC6. Begin on pointer down (or when a text layer is added), end
 * on release (or when editing ends). Two gestures never merge. Undo, redo, New project and any edit made
 * outside a gesture that changes the project cut an open
 * gesture: `onCut` is called (after the restored project is in place), `active` turns false, and an
 * edit through it afterwards starts a new step.
 */
export function beginGesture(onCut?: () => void): Gesture {
  let state: GestureState | null = { token: ++gestureCounter, cut: historyCut, startEpoch: null };
  const listener = onCut ? () => onCut() : null;
  if (listener) cutListeners.add(listener);
  return {
    edit(op) {
      if (state && state.cut !== historyCut) state = { token: ++gestureCounter, cut: historyCut, startEpoch: null };
      const g = state;
      // One consistent update: watchers never see history and project apart.
      return batch(() => editNow(op, g));
    },
    end() {
      state = null;
      if (listener) cutListeners.delete(listener);
    },
    get active() {
      return state !== null && state.cut === historyCut;
    },
  };
}

/** Apply an operation to the session's project as one undo step (none when nothing changed). */
export function edit(op: (p: Project) => EditResult): readonly Notice[] {
  const before = project.peek();
  // One consistent update: watchers (MOD-App's registry sync) never see history and project apart.
  const notices = batch(() => editNow(op, null));
  // An edit outside a gesture that changed the project cuts every open gesture, as undo does: a drag
  // measured from the project as it began (speed, trim) would otherwise write over this edit.
  if (project.peek() !== before) {
    historyCut++;
    cutGestures();
  }
  return notices;
}
function editNow(op: (p: Project) => EditResult, gesture: GestureState | null): readonly Notice[] {
  const before = project.value;
  const r = op(before);
  if (r.project !== before) {
    const token = gesture?.token ?? null;
    const step: Step = { before, after: r.project, changed: r.changed, gesture: token };
    const old = history.value;
    const last = old.past[old.past.length - 1];
    const merging = gesture !== null && last !== undefined && last.gesture === token && last.after === before;
    if (gesture && !merging) gesture.startEpoch = epoch.value;
    history.value = record(old, step);
    // A gesture that ended where it began leaves no step: keep the original document's identity, and
    // (RULE-19) the change epoch it had, since no undo step was made.
    const dropped = history.value.past.length < old.past.length;
    const wasExported = gesture !== null && exportedEpoch.value === gesture.startEpoch;
    project.value = dropped ? old.past[old.past.length - 1]!.before : r.project;
    epoch.value++;
    if (dropped && wasExported) exportedEpoch.value = epoch.value;
  }
  return r.notices;
}

function itemIds(p: Project): Set<string> {
  return new Set([...p.clips.map((c) => c.id), ...p.textLayers.map((t) => t.id), ...p.audioClips.map((a) => a.id)]);
}

/**
 * RULE-13 after undo or redo: select the item the step changed if it still exists, otherwise nothing; a
 * step that changed several items that still exist (a batch, a removed source's clips) selects nothing
 * (build question 103). The playhead is limited to the project end.
 */
function restore(p: Project, step: Step): void {
  project.value = p;
  const present = itemIds(p);
  const kept = step.changed.filter((id) => present.has(id));
  selection.value = kept.length === 1 ? kept : [];
  playhead.value = Math.min(playhead.value, projectEnd(p));
  epoch.value++;
}

export function undo(): void {
  // One consistent update: watchers (MOD-App's registry sync) never see history and project apart.
  batch(() => undoNow());
  cutGestures();
}
function undoNow(): void {
  historyCut++;
  const r = undoStep(history.value);
  if (!r) return;
  history.value = r.history;
  restore(r.step.before, r.step);
}

export function redo(): void {
  // One consistent update: watchers (MOD-App's registry sync) never see history and project apart.
  batch(() => redoNow());
  cutGestures();
}
function redoNow(): void {
  historyCut++;
  const r = redoStep(history.value);
  if (!r) return;
  history.value = r.history;
  restore(r.step.after, r.step);
}

/** Implements: RULE-23 New project — empty document, empty history, copied adjustments cleared. */
export function newProject(): void {
  // One consistent update: watchers (MOD-App's registry sync) never see history and project apart.
  batch(() => newProjectNow());
  cutGestures();
}
function newProjectNow(): void {
  historyCut++;
  project.value = EMPTY_PROJECT;
  history.value = EMPTY_HISTORY;
  selection.value = [];
  playhead.value = 0;
  copiedGrade.value = null;
  epoch.value++;
  exportedEpoch.value = epoch.value;
}

/** Implements: RULE-19 — a video or audio export clears unexported changes; a GIF never does (D-019). */
export function markExported(kind: 'video' | 'gif' | 'audio'): void {
  if (kind !== 'gif') exportedEpoch.value = epoch.value;
}
