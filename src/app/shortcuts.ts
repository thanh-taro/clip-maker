// MOD-App — the RULE-20 keys F-017 adds (View: = and -, Shift+Z, N; Files: Mod+O, Mod+E; Help: ?) and the
// open state of CMP-ShortcutHelp. MOD-Keys resolves the key in its scope; this binder runs what it resolved,
// through the same functions as the visible controls (CMP-Timeline's zoom controls and Snapping, CMP-Toolbar's
// Add media, Export and Keyboard shortcuts), so a key and its control always do the same.
// Implements: F-017.R1 (View, Files and Help keys), F-017.R3 (? or COPY-action.shortcuts opens the list),
// RULE-20 *View*, *Files*, *Help*; CMP-ShortcutHelp "Behavior" (focus returns to the opener).
import { signal } from '@preact/signals';
import { isMac, resolveKey, scopeOf, type Action } from '../keys';
import { isEmpty } from '../project';
import { needsClip } from './adding';
import { device } from './device';
import { openPanel as openExport, panelOpen as exportOpen } from './export';
import { editorLocked } from './lock';
import { addMedia } from './MediaInput';
import { focusInfo } from './playback';
import { timelineNav, timelineView, toggleSnapping } from './timeline-nav';

/** CMP-ShortcutHelp is open. */
export const helpOpen = signal(false);

/** What opened the list (the toolbar button, More, or what had focus when ? was pressed): focus returns to it. */
let opener: HTMLElement | null = null;

/** F-017.R3: opens CMP-ShortcutHelp; `from` gets focus back when it closes. */
export function openHelp(from?: Element | null): void {
  if (editorLocked.peek() || helpOpen.peek()) return;
  opener = from instanceof HTMLElement && from !== document.body ? from : null;
  helpOpen.value = true;
}

/** Esc or close (CMP-ShortcutHelp "Behavior"). */
export function closeHelp(): void {
  helpOpen.value = false;
}

/** The element focus returns to once the dialog has closed (read once). */
export function takeHelpOpener(): HTMLElement | null {
  const el = opener;
  opener = null;
  return el;
}

/**
 * Runs a RULE-20 view, file or help action; true when the action is one of them (the key is then taken from
 * the browser, as every key in scope is). Each one does what its visible control does, and nothing where
 * that control is unavailable (SCR-Editor "Unavailable controls": zoom and snapping in the empty state; Export
 * without a clip, CMP-Toolbar).
 */
export function runShortcutAction(action: Action, repeat = false, from: Element | null = null): boolean {
  const empty = isEmpty.peek();
  switch (action) {
    case 'zoom-in':
      if (!empty) timelineView.peek()?.zoomIn();
      return true;
    case 'zoom-out':
      if (!empty) timelineView.peek()?.zoomOut();
      return true;
    case 'zoom-fit':
      // CMP-Timeline: Fit is available when the view can zoom out.
      if (!empty && timelineNav.peek().canZoomOut) timelineView.peek()?.fit();
      return true;
    case 'snapping':
      if (!empty && !repeat) toggleSnapping();
      return true;
    case 'add-media':
      // CMP-Toolbar Add media: the media panel and the file picker together (F-001).
      if (!repeat) addMedia({ currentTarget: from });
      return true;
    case 'export':
      if (!repeat && !needsClip.peek() && device.peek().status === 'supported' && !exportOpen.peek()) openExport();
      return true;
    case 'help':
      if (!repeat) openHelp(from);
      return true;
    default:
      return false;
  }
}

/**
 * The DOM binder for these keys on the tool's document (RULE-20 scope: no field edited, no dialog or menu,
 * no focused control that uses the key; while an export runs or a text is edited, none acts).
 */
export function bindShortcutKeys(doc: Document = document): () => void {
  const mac = isMac(navigator.platform || navigator.userAgent);
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.isComposing) return;
    const action = resolveKey(e, scopeOf(focusInfo(doc.activeElement), e.code), mac);
    if (action && runShortcutAction(action, e.repeat, doc.activeElement)) e.preventDefault();
  };
  doc.addEventListener('keydown', onKey);
  return () => doc.removeEventListener('keydown', onKey);
}
