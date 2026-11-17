---
id: F-008
title: Apply a look
status: building
milestone: M-1
priority: P0
personas: [PER-02, PER-03]
entities: [ENT-Clip]
rules: [RULE-09, RULE-08, RULE-13]
screens: [SCR-Editor]
components: [CMP-LookGallery, CMP-Inspector]
nfr: [NFR-03, NFR-08]
events: []
depends_on: [F-003]
---

## Intent
A trending colour look is the fastest way to make footage feel finished. Users expect a gallery of styles they can tap through (D-009).

## Scope
- In: the bundled looks (RULE-09) in groups, with live thumbnails; intensity; combining with adjustments.
- Out: importing the user's own look files (M-2); looks that change over time.

## Requirements
- **R1** The user can browse the looks by group. Each shows its name and a thumbnail of the selected clip with that look.
- **R2** Pointer hover or keyboard focus on a look previews it on the selected clip without an undo step. A click, tap or Enter chooses it as one undo step (RULE-09, RULE-13).
- **R3** The user can set the chosen look's intensity from 0 to 100.
- **R4** A look combines with the clip's adjustments in the order of RULE-08, and choosing a look never resets them.
- **R5** The user can remove the look (None).
- **R6** Looks apply the same in the preview and the export (NFR-08).

## Acceptance criteria
- **AC1** Given a selected clip, when the user opens the look gallery, then the four groups are listed and every look shows a thumbnail of that clip with the look applied. (R1)
- **AC2** Given a selected clip, when the user points at a look or moves keyboard focus to it, then the preview shows it; when pointer or focus leaves without choosing, then the preview returns and no undo step exists. (R2)
- **AC3** Given a chosen look, when the user sets the intensity to 0, then the preview matches the clip with no look. (R3)
- **AC4** Given a clip with Brightness +30, when the user chooses a look, then Brightness is still +30 and both apply. (R4)
- **AC5** Given a clip with a look, when the user picks None, then the look is removed. (R5)
- **AC6** Given each bundled look at 100 on the 24-patch chart, when exported as video, then it matches the preview within NFR-08. (R6)
- **AC7** Given a phone, when the user taps three looks in turn, then the last is applied and three undo steps exist. (R2)

## UX notes
CMP-LookGallery with COPY-looks.title, the group names COPY-looks.group_natural, COPY-looks.group_film, COPY-looks.group_cinematic and COPY-looks.group_bw, COPY-looks.none and COPY-looks.intensity. The look names are in `30-experience/looks.md`.

## Edge cases
- Thumbnails still being drawn → placeholders; the gallery stays usable. Thumbnails use the frame of RULE-09.
- Each look's result is signed off by the owner against its intent in `30-experience/looks.md` on fixed reference images during design.
- A look on a black and white source → still applied; the result may barely differ.

## Open questions
