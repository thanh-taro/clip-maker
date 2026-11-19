// MOD-App — the editor lock of SCR-Editor "exporting": while an export runs the editor is locked (F-015
// edge case "Editing during export"). Its own tiny module so the key binders, history and media input
// can read it without importing the export UI (no import cycles).
// Implements: SCR-Editor "exporting", F-015 edge case "Editing during export", build questions 96 and 100.
import { signal } from '@preact/signals';

/** True while an export runs (CMP-ExportProgress running or cancelling): nothing may change the project. */
export const editorLocked = signal(false);
