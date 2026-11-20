---
id: F-014
title: Undo and redo
status: shipped
milestone: M-1
priority: P0
personas: [PER-03, PER-01]
entities: [ENT-Project]
rules: [RULE-13]
screens: [SCR-Editor]
components: [CMP-Toolbar]
nfr: []
events: []
depends_on: [F-001]
---

## Intent
Being able to undo anything makes experimenting safe (PRN-04, PER-03).

## Scope
- In: undo and redo of every edit per RULE-13.
- Out: undo after the page closes; the project isn't kept (PRN-01).

## Requirements
- **R1** The user can undo the last edit and redo an undone edit, per RULE-13.
- **R2** At least 200 steps can be undone.
- **R3** Undo and redo restore the preview and timeline to the restored project; the selection and playhead follow RULE-13.
- **R4** A new edit after an undo discards the redo steps.

## Acceptance criteria
- **AC1** Given a split, a look change and a text added, when the user undoes three times, then the project is as before the split; when they redo three times, then all three edits are back. (R1, R3)
- **AC2** Given 250 edits, when the user undoes repeatedly, then at least 200 are undone. (R2)
- **AC3** Given an undone edit, when the user makes a new edit, then redo is unavailable. (R4)
- **AC4** Given a slider dragged through many values in one movement, when the user undoes, then the value returns to before the drag in one step. (R1)
- **AC5** Given a deleted clip, when the user undoes, then the restored clip is selected; given an undone add of the last clip, when the playhead was past the new end, then it moves to the end. (R3)
- **AC6** Given a new text layer typed in and finished, when the user undoes once, then the layer is gone. (R1)

## UX notes
CMP-Toolbar holds COPY-action.undo and COPY-action.redo; each is unavailable when there is nothing to undo or redo.

## Edge cases
- Undo during playback → playback continues with the restored project; if the restored project ends before the playhead, playback stops at the end.

## Open questions
