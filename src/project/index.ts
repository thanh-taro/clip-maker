// MOD-Project — immutable document, edit operations, history, unexported state
// (specs/40-technical/modules/MOD-Project.md, ADR-0011). Imports only MOD-Core (and signals).
// The session's project lives in signals; every edit is a pure operation (ops.ts) committed here as
// one RULE-13 step (coalesced inside a gesture).
import { computed, signal } from '@preact/signals';
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

let gestureToken: number | null = null;
let gestureCounter = 0;

/** RULE-13: one continuous drag, slider movement or text editing session is one step. */
export function beginGesture(_key: string): void {
  gestureToken = ++gestureCounter;
}
export function endGesture(): void {
  gestureToken = null;
}

/** Apply an operation to the session's project as one undo step (none when nothing changed). */
export function edit(op: (p: Project) => EditResult): readonly Notice[] {
  const before = project.value;
  const r = op(before);
  if (r.project !== before) {
    const step: Step = { before, after: r.project, changed: r.changed, gesture: gestureToken };
    const old = history.value;
    history.value = record(old, step);
    // A gesture that ended where it began leaves no step; keep the original document's identity.
    const dropped = history.value.past.length < old.past.length;
    project.value = dropped ? old.past[old.past.length - 1]!.before : r.project;
    epoch.value++;
  }
  return r.notices;
}

function itemIds(p: Project): Set<string> {
  return new Set([...p.clips.map((c) => c.id), ...p.textLayers.map((t) => t.id), ...p.audioClips.map((a) => a.id)]);
}

/** RULE-13 after undo or redo: select what the step changed if it still exists; limit the playhead. */
function restore(p: Project, step: Step): void {
  project.value = p;
  const present = itemIds(p);
  selection.value = step.changed.filter((id) => present.has(id));
  playhead.value = Math.min(playhead.value, projectEnd(p));
  epoch.value++;
}

export function undo(): void {
  endGesture();
  const r = undoStep(history.value);
  if (!r) return;
  history.value = r.history;
  restore(r.step.before, r.step);
}

export function redo(): void {
  endGesture();
  const r = redoStep(history.value);
  if (!r) return;
  history.value = r.history;
  restore(r.step.after, r.step);
}

/** Implements: RULE-23 New project — empty document, empty history, copied adjustments cleared. */
export function newProject(): void {
  endGesture();
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
