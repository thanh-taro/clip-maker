---
id: CMP-ExportProgress
title: Export progress
status: ready
tokens: [border.width.focus, border.width.hairline, color.dark.accent, color.dark.danger, color.dark.fg, color.dark.focus, color.dark.line, color.dark.lineStrong, color.dark.muted, color.dark.onAccent, color.dark.scrim, color.dark.success, color.dark.surface, color.dark.surface2, color.light.accent, color.light.danger, color.light.fg, color.light.focus, color.light.line, color.light.lineStrong, color.light.muted, color.light.onAccent, color.light.scrim, color.light.success, color.light.surface, color.light.surface2, font.family.body, font.family.mono, font.size.2xs, font.size.md, font.size.sm, font.size.xs, motion.duration.base, radius.md, radius.pill, radius.sm, size.icon.md, size.popover, size.touchTarget, space.1, space.1_5, space.2, space.3, space.4]
---

## Titles
COPY-export.failed_title, COPY-export.interrupted_title, COPY-export.no_space_title.

## Purpose
Shows a running export and lets the user cancel it.

## Anatomy
Title (COPY-export.title) with a state icon; progress text (COPY-export.progress); progress bar; COPY-export.keep_open; actions.

## Variants & states
| Variant / state | Description |
|---|---|
| running · wide | Modal dialog: COPY-export.title, COPY-export.progress (percent and time remaining in mono), an accent progress bar, COPY-export.keep_open in muted text, and a quiet COPY-action.cancel. |
| cancelling · wide | COPY-export.cancelling; the bar freezes in a neutral fill and Cancel is disabled (readable) until the export has stopped (within 1 s, F-015.AC3). |
| done · wide | Success icon and COPY-export.done with the RULE-15 file name in mono; COPY-action.close. |
| failed · wide | Titled with the outcome COPY-export.failed_title in the danger colour (medium size, semibold) beside the error icon; COPY-error.export_failed in normal text below; COPY-action.close and an outlined COPY-action.change_settings, which reopens CMP-ExportPanel. |
| interrupted · wide | Titled COPY-export.interrupted_title in the danger colour beside the page-hidden icon; COPY-error.export_interrupted below; COPY-action.close and an outlined COPY-action.try_again with the same settings. |
| no space · wide | Titled COPY-export.no_space_title in the danger colour beside the storage icon; COPY-error.no_space below, shown before the export starts; COPY-action.close and COPY-action.change_settings. |
| narrow | The same states as a bottom sheet with a grab handle; actions are full-width touch-size buttons side by side (running, done, and failed in vi-VN are shown). Error titles follow the wide rows in every layout. |

## Behavior
- Shown over a scrim while an export runs; the editor behind is locked (SCR-Editor exporting) and the toolbar Export shows its busy state (CMP-ExportPanel opener states). The dialog can't be dismissed by clicking outside while running.
- The percentage updates at least once a second and never goes down; time remaining appears from the first estimate and is hidden until then (F-015.AC12).
- Cancel stops the export, saves nothing and closes the dialog; Esc acts as Cancel while running (RULE-20).
- Done appears once the file is handed to the browser; a save the browser reports as cancelled shows the failed state instead and doesn't clear unexported changes (RULE-19, D-018).
- Every ending (done, failed, interrupted, cancelled) removes scratch space (F-015.R7) and unlocks the editor; edits are never lost.
- GIF and audio exports use the same dialog and states (F-016.R3).
- Only one filled button is ever on screen; dialog actions are quiet or outlined.

## Accessibility
- The dialog is modal and named by COPY-export.title, or by its outcome title (COPY-export.failed_title, COPY-export.interrupted_title, COPY-export.no_space_title) in the error states; focus starts on Cancel while running and on the first action in end states, and returns to COPY-action.export when it closes.
- Progress is a native progress element named COPY-export.progress_label; the text line is a polite live region updated at most every few seconds so screen readers aren't flooded.
- Done is announced as a status; failed, interrupted and no-space use an alert dialog so the message is read at once.
- Success and error are shown by icon and text, never colour alone. Buttons meet RULE-21 touch targets on coarse pointers (NFR-06).
