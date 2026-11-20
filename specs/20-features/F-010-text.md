---
id: F-010
title: Add text
status: shipped
milestone: M-1
priority: P0
personas: [PER-01, PER-02, PER-03]
entities: [ENT-TextLayer]
rules: [RULE-11, RULE-05, RULE-13, RULE-21]
screens: [SCR-Editor]
components: [CMP-TextEditor, CMP-Timeline, CMP-Preview, CMP-Inspector]
nfr: [NFR-06, NFR-08, NFR-01]
events: []
depends_on: [F-002]
---

## Intent
Titles, labels on screen recordings and captions typed by hand turn footage into a message (PER-01, PER-03).

## Scope
- In: adding, editing, styling, placing, timing and deleting text layers (RULE-11), including Vietnamese text.
- Out: automatic captions (non-goal); animated text beyond fades (M-2); emoji fonts beyond what the device shows.

## Requirements
- **R1** The user can add a text layer, which starts at the playhead per RULE-11, and type its content directly.
- **R2** The user can set the typeface, size, colour, style, alignment and fade of a text layer (RULE-11).
- **R3** The user can move a text layer in the preview, with snapping to the centre lines and safe margins, and can set its position with visible controls.
- **R4** The user can change a text layer's start and end on the timeline, and duplicate or delete it.
- **R5** Text renders the same in the preview and the export, including Vietnamese letters, from the tool's own typefaces (NFR-08, NFR-01).
- **R6** Text over the character limit is not accepted. Pasted text is shortened to fit and kept in composed form (RULE-11).
- **R7** When text layers overlap in time, later layers draw on top, and the user can bring a layer forward or send it back.
- **R8** The user can move a selected text layer earlier or later in time with visible controls, without dragging (RULE-21, NFR-06).

## Acceptance criteria
- **AC1** Given a 10 s project and the playhead at 2 s, when the user adds text and types "Đà Lạt 2026", then a layer from 2 s to 5 s shows it centred at 80 % height in the Sans typeface, white with an outline. (R1)
- **AC2** Given a text layer, when the user sets Display, size 10 %, yellow and the Box style, then the preview shows exactly that. (R2)
- **AC3** Given snapping on, when the user drags a text layer so its left edge comes within 8 screen pixels of the left safe margin, then its left edge snaps to that margin. (R3)
- **AC4** Given a text layer from 2 s to 5 s, when the user drags its end to 8 s, then it ends at 8 s. (R4)
- **AC5** Given text in each typeface containing every Vietnamese tone mark, when exported offline, then every glyph renders as in the preview and no font is requested. (R5)
- **AC6** Given a layer with 495 characters, when the user pastes 20 more (including letters with Vietnamese tone marks), then only 5 user-perceived characters are added and none is split. (R6)
- **AC7** Given two overlapping layers, when the user sends the top one back, then the other draws on top. (R7)
- **AC8** Given a layer that contains only spaces, when the user finishes editing it, then the layer is removed. (R1)
- **AC9** Given an empty project, when the user adds text, then the layer runs from 0 to 3 s. (R1)
- **AC10** Given a selected text layer, when the user activates COPY-action.time_later, then it moves later by one frame. (R8)
- **AC11** Given a text layer with fade on, when the playhead is at its start, then the text is fully transparent and at 0.3 s fully visible. (R2)
- **AC12** Given a selected text layer, when the user duplicates it and then deletes the original, then one layer with the same content and times remains. (R4)

## UX notes
CMP-TextEditor appears over the preview while editing. The style controls are in CMP-Inspector under COPY-inspector.text: COPY-text.typeface (COPY-text.sans, COPY-text.display, COPY-text.serif, COPY-text.rounded), COPY-text.size, COPY-text.colour, COPY-text.style (COPY-text.plain, COPY-text.outline, COPY-text.shadow, COPY-text.box), COPY-text.align. Time controls use COPY-action.time_earlier and COPY-action.time_later. COPY-action.add_text adds a layer.

## Edge cases
- Adding text when there are already 50 layers → refused with COPY-notice.text_limit.
- Text longer than the frame is wide → it wraps per RULE-11; text that is too tall may extend beyond the frame and is cut off.
- Adding text in an empty project → it runs 0–3 s (RULE-11) and stays past the project end until clips exist (INV-07).

## Open questions
