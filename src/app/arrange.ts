// MOD-App — arranging clips on the main track (F-003): the selection, which clip actions are available,
// and the actions behind the timeline's toolbar, the phone Edit sheet, the RULE-20 keys and a drag on
// the timeline. Every action is one MOD-Project edit, so it is one RULE-13 undo step in the session's
// history (F-014 adds the Undo UI); refusals and shortenings show as CMP-Notice.
// Implements: F-003.R1 (select), F-003.R2 (move), F-003.R3 (delete), F-003.R4 (duplicate), F-003.R5
// (through MOD-Project's RULE-05 / RULE-03 operations), F-003.R6 (each without a drag), RULE-20 Edit
// keys (Delete/Backspace, Mod+D, Alt+Left/Right).
import { computed } from '@preact/signals';
import type { Clip } from '../core';
import { isMac, resolveKey, scopeOf, type Action } from '../keys';
import { deleteItem, duplicateClip, edit, moveClip, project, selection } from '../project';
import { nextItemId, showResultNotices } from './adding';
import { focusInfo } from './playback';

/** F-003.R1: the selected main-track clip, if the selection is one. */
export const selectedClip = computed<Clip | null>(() => {
  const id = selection.value[0];
  return (id !== undefined && project.value.clips.find((c) => c.id === id)) || null;
});

const selectedIndex = computed(() => {
  const clip = selectedClip.value;
  return clip ? project.value.clips.indexOf(clip) : -1;
});

/**
 * SCR-Editor "Unavailable controls": with nothing selected, delete, duplicate and move are unavailable;
 * the first clip can't move earlier, nor the last later.
 */
export const arrangeAvailable = computed(() => {
  const i = selectedIndex.value;
  const n = project.value.clips.length;
  return { earlier: i > 0, later: i >= 0 && i < n - 1, delete: i >= 0, duplicate: i >= 0 };
});

/** F-003.R1: select a clip, or nothing (not an undo step, RULE-13). */
export function selectClip(id: string | null): void {
  const next = id === null ? [] : [id];
  if (next.join() !== selection.peek().join()) selection.value = next;
}

/** Runs one edit; false when nothing changed (refused, or no move). */
function commit(op: Parameters<typeof edit>[0]): boolean {
  const before = project.peek();
  showResultNotices(edit(op));
  return project.peek() !== before;
}

/** F-003.R2: move a clip to index `to` of the resulting order (a drag drop, RULE-05). */
export function moveClipTo(id: string, to: number): boolean {
  return commit((p) => moveClip(p, id, to));
}

/** F-003.R2/R6: Move earlier / Move later — the selected clip one place along the main track. */
export function moveSelected(direction: 'earlier' | 'later'): boolean {
  const clip = selectedClip.peek();
  const i = selectedIndex.peek();
  const to = direction === 'earlier' ? i - 1 : i + 1;
  if (!clip || to < 0 || to >= project.peek().clips.length) return false;
  return moveClipTo(clip.id, to);
}

/** F-003.R3: delete the selected clip; later clips close the gap and nothing is selected afterwards. */
export function deleteSelected(): boolean {
  const clip = selectedClip.peek();
  const index = selectedIndex.peek();
  if (!clip) return false;
  const done = commit((p) => deleteItem(p, clip.id));
  if (done) {
    selectClip(null);
    afterDelete?.(index);
  }
  return done;
}

/** F-003.R4: duplicate the selected clip right after it; the original stays selected. */
export function duplicateSelected(): boolean {
  const clip = selectedClip.peek();
  if (!clip) return false;
  return commit((p) => duplicateClip(p, clip.id, nextItemId));
}

/** RULE-20 Edit keys of F-003: true when the action applied (the key is then taken from the browser). */
export function runArrangeAction(action: Action): boolean {
  switch (action) {
    case 'delete':
      return deleteSelected();
    case 'duplicate':
      // Mod+D is taken while a clip is selected even when the copy is refused (its notice says why).
      if (!selectedClip.peek()) return false;
      duplicateSelected();
      return true;
    case 'move-earlier':
    case 'move-later':
      if (!selectedClip.peek()) return false;
      moveSelected(action === 'move-earlier' ? 'earlier' : 'later');
      return true;
    default:
      return false;
  }
}

/** Called with the deleted clip's index (the timeline then keeps keyboard focus on the track). */
let afterDelete: ((index: number) => void) | null = null;
export function onDeleted(fn: ((index: number) => void) | null): void {
  afterDelete = fn;
}

/**
 * The DOM binder for the arrange keys (RULE-20 scope: no field edited, no dialog or menu, no control
 * that uses the key). Takes a key from the browser only when it acted.
 */
export function bindArrangeKeys(doc: Document = document): () => void {
  const mac = isMac(navigator.platform || navigator.userAgent);
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing) return;
    const action = resolveKey(e, scopeOf(focusInfo(doc.activeElement), e.code), mac);
    if (action && runArrangeAction(action)) e.preventDefault();
  };
  doc.addEventListener('keydown', onKey);
  return () => doc.removeEventListener('keydown', onKey);
}
