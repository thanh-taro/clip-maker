---
id: F-017
title: Control by keyboard and touch
status: ready
milestone: M-1
priority: P1
personas: [PER-01, PER-02]
entities: []
rules: [RULE-20, RULE-21]
screens: [SCR-Editor]
components: [CMP-ShortcutHelp, CMP-Timeline, CMP-Preview, CMP-Toolbar]
nfr: [NFR-06, NFR-07]
events: []
depends_on: [F-002, F-004]
---

## Intent
Desktop users edit fastest with keys, and phone users with fingers. Both must feel native (PRN-06).

## Scope
- In: the keyboard map (RULE-20), the touch gestures (RULE-21), and the shortcut list.
- Out: custom key bindings.

## Requirements
- **R1** On a device with a keyboard, every key in RULE-20 does what it lists, only within its scope.
- **R2** On touch, the gestures of RULE-21 work on the timeline and the preview, and touch targets meet RULE-21's minimum size.
- **R3** The user can open a list of shortcuts, in the active language, by the ? key or a visible control.
- **R4** Every gesture has an equivalent visible control (NFR-06).
- **R5** A focused control that uses a key itself gets that key (RULE-20).

## Acceptance criteria
- **AC1** Given focus on the timeline, when the user presses Space, S and Mod+Z, then playback toggles, the clip splits at the playhead, and the split is undone. (R1)
- **AC2** Given a text field being edited, when the user presses S, then an "s" is typed and nothing splits. (R1)
- **AC3** Given a phone, when the user presses and holds a clip for 0.4 s and drags it, then it moves; a quick swipe scrolls the timeline and scrubs instead. (R2)
- **AC4** Given the tool, when the user presses ? or activates COPY-action.shortcuts, then CMP-ShortcutHelp lists RULE-20 in the active language. (R3)
- **AC5** Given each gesture in RULE-21's equivalence list, when the paired control is used instead, then the result is the same: pinch → zoom controls; hold-and-drag → move-earlier/later or time controls; trim drag → start-here/end-here; preview drag and pinch → placement and text position controls; scrub → frame step and play. (R4)
- **AC6** Given keyboard focus on the Brightness slider, when the user presses Right, then the slider value rises and the playhead doesn't move; given focus on a button, when the user presses Space, then the button activates and playback doesn't toggle. (R5)
- **AC7** Given a video clip selected and the clipboard holding a video file, when the user presses Mod+V, then the file is added as media; given the clipboard holding no file and copied adjustments, then they are pasted onto the clip. (R1)

## UX notes
CMP-ShortcutHelp with COPY-help.title, opened from CMP-Toolbar with COPY-action.shortcuts.

## Edge cases
- A non-Latin keyboard layout → letter keys follow the key's position on a US layout.

## Open questions
