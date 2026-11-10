// MOD-App — undo and redo in the editor (F-014): CMP-Toolbar's Undo and Redo, their availability, and
// the RULE-20 *History* keys. MOD-Project keeps the history (ADR-0011 §3) and restores the selection and
// the playhead per RULE-13; the preview and the timeline follow the restored project through its signals
// (the preview seeks to a limited playhead through the playhead binding, and keeps playing).
// Implements: F-014.R1 (undo, redo, keys), F-014.R3 (restore through the session's signals), RULE-20
// History.
import { computed } from '@preact/signals';
import { isMac, resolveKey, scopeOf, type Action } from '../keys';
import { canRedo, canUndo, redo, undo } from '../project';
import { focusInfo } from './playback';

/** CMP-Toolbar: Undo and Redo are each unavailable when there is nothing to undo or redo (F-014 UX notes). */
export const historyAvailable = computed(() => ({ undo: canUndo.value, redo: canRedo.value }));

/** F-014.R1: undo the last edit; false when there is nothing to undo. */
export function undoEdit(): boolean {
  if (!canUndo.peek()) return false;
  undo();
  return true;
}

/** F-014.R1: redo the last undone edit; false when there is nothing to redo. */
export function redoEdit(): boolean {
  if (!canRedo.peek()) return false;
  redo();
  return true;
}

/**
 * RULE-20 *History* keys: true when the action is a history key. Within the scope (MOD-Keys checked it)
 * the tool takes Mod+Z, Mod+Shift+Z and Ctrl+Y even with nothing to undo or redo, so they never reach
 * the browser's own history of the page.
 */
export function runHistoryAction(action: Action): boolean {
  if (action === 'undo') undoEdit();
  else if (action === 'redo') redoEdit();
  else return false;
  return true;
}

/**
 * The DOM binder for the history keys on the tool's document (RULE-20 scope: inside a text or number
 * field the field keeps its own undo; a dialog or menu takes none).
 */
export function bindHistoryKeys(doc: Document = document): () => void {
  const mac = isMac(navigator.platform || navigator.userAgent);
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing) return;
    const action = resolveKey(e, scopeOf(focusInfo(doc.activeElement), e.code), mac);
    if (action && runHistoryAction(action)) e.preventDefault();
  };
  doc.addEventListener('keydown', onKey);
  return () => doc.removeEventListener('keydown', onKey);
}
