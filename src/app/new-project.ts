// MOD-App — F-018 warn before losing work (specs/20-features/F-018-unexported-warning.md): the browser's
// leave-page warning while the project has unexported changes (RULE-19), and New project (RULE-23), which
// asks first through CMP-ConfirmDialog when there is something to lose. MOD-Project keeps the unexported
// state (`unexported`, ADR-0011 §5); nothing here talks to the host: the warning is the browser's own
// dialog, which an embedding page allows through its frame grants (RULE-17, F-019.R6), and the host
// contract's only message stays the ready signal (INV-08).
// Implements: F-018.R1–R3, RULE-19 (the warning), RULE-23 (app side: the export panel closes, batches being
// checked are dropped), CMP-ConfirmDialog "Behavior", platform-mapping "Leave-page warning".
import { effect, signal } from '@preact/signals';
import { newProject, unexported } from '../project';
import { dropAdding } from './adding';
import { closePanel as closeExportPanel } from './export';
import { editorLocked } from './lock';
import { closeNotice, notices } from './notice-stack';

/** CMP-ConfirmDialog is open, asking before New project (F-018.AC3). */
export const confirmOpen = signal(false);

/** The control New project was picked from: focus returns to it when the dialog closes. */
let opener: HTMLElement | null = null;

/** Starts the new project (RULE-23). The export settings, snapping and zoom live elsewhere and are kept. */
function startNewProject(): void {
  // RULE-23 "removes every source": a batch still being checked never lands in the new project (Q192).
  dropAdding();
  // The panel of an empty project has nothing to export (Export is unavailable without a clip, RULE-03).
  closeExportPanel(false);
  newProject();
  // The old project's results and warnings no longer apply; a progress notice belongs to its running task.
  for (const n of notices.peek()) if (n.kind !== 'progress') closeNotice(n.key);
}

export type NewProjectOutcome = 'started' | 'asking' | 'locked';

/**
 * Implements: F-018.R2, F-018.AC3, F-018.AC5, CMP-Toolbar "New project asks first" — with unexported
 * changes CMP-ConfirmDialog asks; without them the new project starts at once. While an export runs the
 * editor is locked and nothing happens (SCR-Editor "exporting").
 */
export function requestNewProject(from: HTMLElement | null = null): NewProjectOutcome {
  if (editorLocked.peek()) return 'locked';
  if (unexported.peek()) {
    opener = from;
    confirmOpen.value = true;
    return 'asking';
  }
  startNewProject();
  return 'started';
}

/** CMP-ConfirmDialog's COPY-action.new_project: starts the new project (F-018.R3, RULE-23). */
export function confirmNewProject(): void {
  if (!confirmOpen.peek() || editorLocked.peek()) return;
  confirmOpen.value = false;
  startNewProject();
}

/** CMP-ConfirmDialog's Cancel, Esc or a click on the scrim: nothing changes (F-018.AC3). */
export function cancelNewProject(): void {
  confirmOpen.value = false;
}

/** The control to give focus back to when the dialog closes (CMP-ConfirmDialog "Accessibility"). */
export function takeOpener(): HTMLElement | null {
  const el = opener;
  opener = null;
  return el;
}

/** The part of `window` the warning needs (tests pass a stand-in). */
export interface LeaveTarget {
  addEventListener(type: 'beforeunload', fn: EventListener): void;
  removeEventListener(type: 'beforeunload', fn: EventListener): void;
}

/** Asks the browser to show its leave-page warning (it chooses the wording; PRN-01: nothing is kept). */
function warn(e: Event): void {
  e.preventDefault();
  // Engines that predate `preventDefault()` on this event read a non-undefined `returnValue` instead.
  (e as unknown as { returnValue: string }).returnValue = '';
}

/**
 * Implements: F-018.R1, F-018.AC1, F-018.AC2, RULE-19, platform-mapping "Leave-page warning" — a
 * `beforeunload` listener is registered only while the project has unexported changes, so a page with
 * nothing to lose leaves without a warning (and stays eligible for the browser's back-forward cache).
 * Returns the unbinder.
 */
export function bindLeaveWarning(target: LeaveTarget = window): () => void {
  let bound = false;
  const set = (on: boolean): void => {
    if (on === bound) return;
    bound = on;
    if (on) target.addEventListener('beforeunload', warn);
    else target.removeEventListener('beforeunload', warn);
  };
  const dispose = effect(() => set(unexported.value));
  return () => {
    dispose();
    set(false);
  };
}
