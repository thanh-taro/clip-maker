// MOD-App — text layers (F-010): what is selected, the editing session of CMP-TextEditor, and the actions
// behind CMP-Inspector's text section, the phone Text tab, the toolbar's Add text, the RULE-20 T key and the
// preview's text drag. The rule maths is MOD-Core's / MOD-Project's (RULE-11: addText, editText, finishText,
// setTextStyle, restackText, duplicateText, moveItemTime, setTextTimes); the rasteriser and the move geometry
// are MOD-Preview's.
// One editing session is one RULE-13 step: adding a layer plus typing until editing ends, or each later
// session; removing empty text is part of it (F-014 `beginGesture`). Style changes made from the editor's own
// controls while it is open join that step. Any outside edit (a media batch landing, Q96), undo, redo or New
// project cuts the session's gesture: what was typed so far stays as its own step and typing goes on in a new
// step; when the layer no longer exists the editor closes, keeping no stale id.
// Implements: F-010.R1 (add at the playhead and type), F-010.R2 (typeface, size, colour, style, alignment,
// fade), F-010.R3 (position by visible controls; the preview drag), F-010.R4 (duplicate, delete), F-010.R6
// (the character limit, NFC), F-010.R7 (bring forward / send back), F-010.R8 (Earlier / Later without
// dragging), RULE-11, RULE-13, RULE-20 (T; Alt / Shift+Alt arrows move a text layer one frame / 1 s),
// RULE-21 (time controls for text layers), F-010 edge case (50 layers: COPY-notice.text_limit).
import { computed, signal } from '@preact/signals';
import { clampText, characterCount, frameIndexAt, frameStart, RULE_07, RULE_11, textFadeFrames, type TextLayer } from '../core';
import {
  addText,
  beginGesture,
  deleteItem,
  duplicateText,
  edit,
  editText,
  finishText,
  moveItemTime,
  playhead,
  project,
  resetTextStyle,
  restackText,
  selection,
  setTextStyle,
  type EditResult,
  type Gesture,
  type TextStyle,
} from '../project';
import type { Project } from '../core';
import { nextItemId, showResultNotices } from './adding';

/** F-010: the selected text layer, if the selection is one. */
export const selectedText = computed<TextLayer | null>(() => {
  const id = selection.value[0];
  return (id !== undefined && project.value.textLayers.find((t) => t.id === id)) || null;
});

/** The open editing session (CMP-TextEditor): the layer being edited, or null. */
export const editingText = signal<string | null>(null);

/** The layer being edited, as it is now (null when none, or when it no longer exists). */
export const editedLayer = computed<TextLayer | null>(() => {
  const id = editingText.value;
  return (id !== null && project.value.textLayers.find((t) => t.id === id)) || null;
});

interface Session {
  readonly id: string;
  readonly gesture: Gesture;
}
let session: Session | null = null;

/** Called when the editing session ends (CMP-TextEditor moves focus). */
let onClosed: ((id: string, kept: boolean) => void) | null = null;
export function onEditingClosed(fn: ((id: string, kept: boolean) => void) | null): void {
  onClosed = fn;
}

function openSession(id: string): Session {
  const s: Session = {
    id,
    gesture: beginGesture(() => {
      // Q96: an outside edit, undo, redo or New project cut the session. The layer gone: close without a
      // stale id. Still there: what was typed stays its own step; the next keystroke starts a new one.
      if (session === s && !project.peek().textLayers.some((t) => t.id === id)) closeSession(false);
    }),
  };
  session = s;
  editingText.value = id;
  return s;
}

function closeSession(kept: boolean): void {
  const s = session;
  if (!s) return;
  session = null;
  s.gesture.end();
  editingText.value = null;
  onClosed?.(s.id, kept);
}

/** Selects a text layer, or nothing (not an undo step, RULE-13). */
export function selectText(id: string | null): void {
  const next = id === null ? [] : [id];
  if (next.join() !== selection.peek().join()) selection.value = next;
}

/**
 * Implements: F-010.R1, RULE-11 *Time*, F-010.AC9 — Add text: a new layer at the playhead (3 s, or 0–3 s in an
 * empty project), selected, with the editor open on it. At 50 layers nothing is added and
 * COPY-notice.text_limit shows. The adding and the typing that follows are one step.
 */
export function addTextAndEdit(): boolean {
  finishEditing();
  const id = nextItemId();
  const t = playhead.peek();
  const before = project.peek();
  // The session's gesture makes the add, so the add and the typing that follows are one step.
  const s = openSession(id);
  showResultNotices(s.gesture.edit((p) => addText(p, t, () => id)));
  if (project.peek() === before) {
    closeSession(false);
    return false;
  }
  selectText(id);
  return true;
}

/**
 * CMP-TextEditor "Behavior": double-click / tap (or activate the selected item again) to edit an existing
 * layer. The playhead moves into the layer where its text is fully shown if it is outside (not an undo
 * step), so the text being typed is visible.
 */
export function editLayer(id: string): boolean {
  if (session?.id === id) return true;
  finishEditing();
  const layer = project.peek().textLayers.find((t) => t.id === id);
  if (!layer) return false;
  selectText(id);
  const p = project.peek();
  const rate = p.frame.frameRate;
  const k = frameIndexAt(playhead.peek(), rate);
  const s = frameIndexAt(layer.start, rate);
  const e = frameIndexAt(layer.end, rate);
  if (k < s || k >= e) {
    const fade = layer.fade ? textFadeFrames(e - s, rate) : 0;
    playhead.value = frameStart(Math.min(e - 1, s + fade), rate);
  }
  openSession(id);
  return true;
}

/** Implements: RULE-11 (NFC, at most 500 user-perceived characters) — the editor's text, in the session's step. */
export function typeText(content: string): void {
  const s = session;
  if (!s) return;
  s.gesture.edit((p) => editText(p, s.id, content));
}

/**
 * Implements: RULE-11 *Empty text*, RULE-13 — editing ends (Esc, Mod+Enter, Done, focus leaving the editor):
 * a layer left empty or only whitespace is removed as part of the session's step.
 */
export function finishEditing(): void {
  const s = session;
  if (!s) return;
  const before = project.peek();
  s.gesture.edit((p) => finishText(p, s.id));
  const removed = before.textLayers.some((t) => t.id === s.id) && !project.peek().textLayers.some((t) => t.id === s.id);
  if (removed) selectText(null);
  closeSession(!removed);
}

/** Runs one edit through the open session when it is on `id` (one step with the typing), else on its own. */
function editOn(id: string, op: (p: Project) => EditResult): void {
  if (session?.id === id) showResultNotices(session.gesture.edit(op));
  else showResultNotices(edit(op));
}

/** F-010.R2: typeface, size, colour, style, box colour, alignment, position or fade of layer `id` (one step). */
export function styleText(id: string, change: TextStyle): TextLayer | null {
  editOn(id, (p) => setTextStyle(p, id, change));
  return project.peek().textLayers.find((t) => t.id === id) ?? null;
}

/** CMP-Inspector "text layer" Reset (one step; none at the defaults). */
export function resetText(id: string): void {
  editOn(id, (p) => resetTextStyle(p, id));
}

/** Whether layer `id` has every RULE-11 setting at its default (Reset is then unavailable). */
export function textAtDefaults(layer: TextLayer): boolean {
  const p: Project = { ...project.peek(), textLayers: [layer] };
  return resetTextStyle(p, layer.id).project === p;
}

export type TextNudge = 'left' | 'right' | 'up' | 'down';

/**
 * F-010.R3: the position nudges — 1 % of the frame, 10 % with Shift (the clip nudge of RULE-07, build
 * question 161); one step.
 */
export function nudgeText(id: string, direction: TextNudge, big = false): void {
  const layer = project.peek().textLayers.find((t) => t.id === id);
  if (!layer) return;
  const d = big ? RULE_07.nudgeShift : RULE_07.nudge;
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  styleText(id, direction === 'left' || direction === 'right' ? { x: layer.x + sign * d } : { y: layer.y + sign * d });
}

/** F-010.R7: bring the selected layer forward / send it back in the stacking order (one step). */
export function restack(id: string, direction: 'forward' | 'back'): boolean {
  const before = project.peek();
  editOn(id, (p) => restackText(p, id, direction));
  return project.peek() !== before;
}

/** Whether layer `id` can move forward / back in the stacking order. */
export const stackAvailable = computed(() => {
  const layer = selectedText.value;
  const list = project.value.textLayers;
  const i = layer ? list.indexOf(layer) : -1;
  return { forward: i >= 0 && i < list.length - 1, back: i > 0 };
});

/** F-010.R8 / RULE-20 / RULE-21: the selected text layer `frames` frames earlier (negative) or later. */
export function moveTextBy(frames: number): boolean {
  const layer = selectedText.peek();
  if (!layer) return false;
  const before = project.peek();
  editOn(layer.id, (p) => moveItemTime(p, layer.id, frames));
  return project.peek() !== before;
}

/** A text layer dragged on the timeline by `frames` frames (one step, RULE-21 hold-and-drag). */
export function moveTextFrames(id: string, frames: number): boolean {
  const before = project.peek();
  showResultNotices(edit((p) => moveItemTime(p, id, frames)));
  return project.peek() !== before;
}

/** Whether the selected text layer can move earlier (not before 0). */
export const textMoveAvailable = computed(() => {
  const layer = selectedText.value;
  return { earlier: layer !== null && layer.start > 0, later: layer !== null };
});

/** F-010.R4 / RULE-11 *Duplicate*: same times, drawn on top; the copy is selected. */
export function duplicateSelectedText(): boolean {
  const layer = selectedText.peek();
  if (!layer) return false;
  finishEditing();
  const before = project.peek();
  let copy: string | null = null;
  showResultNotices(
    edit((p) => {
      const r = duplicateText(p, layer.id, nextItemId);
      copy = r.changed[0] ?? null;
      return r;
    }),
  );
  if (copy !== null) selectText(copy);
  return project.peek() !== before;
}

/** F-010.R4: delete the selected text layer; nothing is selected afterwards. */
export function deleteSelectedText(): boolean {
  const layer = selectedText.peek();
  if (!layer) return false;
  if (session?.id === layer.id) closeSession(false);
  const before = project.peek();
  showResultNotices(edit((p) => deleteItem(p, layer.id)));
  const done = project.peek() !== before;
  if (done) selectText(null);
  return done;
}

/** One preview drag of a text layer, or one Size slider movement (F-014 gesture, Q104). */
export interface TextDrag {
  /** The change asked for now, measured from where the drag began. */
  set(change: TextStyle): void;
  end(): void;
  /** Esc or a cancelled pointer: the layer goes back, leaving no step. */
  cancel(): void;
  readonly active: boolean;
}

/**
 * Implements: RULE-13 (one drag is one step), Q104 (back where it began is no change): each move applies to
 * the project as it was when the drag began. `onCut` runs when undo, redo, New project or an outside edit
 * cut it.
 */
export function beginTextDrag(id: string, onCut: () => void): TextDrag {
  const base = project.peek();
  let ended = false;
  const gesture = beginGesture(() => {
    ended = true;
    gesture.end();
    onCut();
  });
  const set = (change: TextStyle): void => {
    if (ended || !gesture.active) return;
    gesture.edit(() => {
      const r = setTextStyle(base, id, change);
      return r.project === base ? { project: base, notices: [], changed: [] } : r;
    });
  };
  return {
    set,
    end() {
      if (ended) return;
      ended = true;
      gesture.end();
    },
    cancel() {
      if (ended) return;
      set({});
      ended = true;
      gesture.end();
    },
    get active() {
      return !ended && gesture.active;
    },
  };
}

/** The count COPY-text.count shows for `content` (user-perceived characters). */
export const countOf = (content: string): number => characterCount(content);

/**
 * Implements: RULE-11, F-010.R6, F-010.AC6 — the text after inserting `data` in place of `value`'s
 * [`start`, `end`) range: NFC, and only as many user-perceived characters of `data` as fit within 500 (none is
 * split). Returns the new value and the caret after the insertion, or null when nothing fits.
 */
export function insertWithin(
  value: string,
  start: number,
  end: number,
  data: string,
  max: number = RULE_11.maxCharacters,
): { readonly value: string; readonly caret: number } | null {
  const head = value.slice(0, start);
  const tail = value.slice(end);
  const room = max - characterCount(head + tail);
  if (room <= 0) return null;
  const piece = clampText(data, room);
  if (piece === '') return null;
  const next = (head + piece + tail).normalize('NFC');
  // NFC may merge across the joins: the caret goes after the inserted piece as composed.
  const caret = (head + piece).normalize('NFC').length;
  return { value: clampText(next, max), caret };
}
