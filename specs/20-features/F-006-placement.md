---
id: F-006
title: Place, rotate and flip clips
status: building
milestone: M-1
priority: P0
personas: [PER-02, PER-04]
entities: [ENT-Clip]
rules: [RULE-07, RULE-04, RULE-14]
screens: [SCR-Editor]
components: [CMP-Inspector, CMP-Preview]
nfr: [NFR-06]
events: []
depends_on: [F-003, F-012]
---

## Intent
Horizontal footage in a vertical frame, a sideways phone video, or a screen recording that needs cropping to the part that matters: each needs a quick fix of how the clip sits in the frame (PER-02, PER-04).

## Scope
- In: fit or fill, scale, position, 90° rotation and flips per clip (RULE-07).
- Out: free rotation angles and animated movement (M-2/M-3); the frame shape itself (F-012).

## Requirements
- **R1** The user can choose Fit or Fill for the selected clip.
- **R2** The user can scale and move the clip within the frame directly in the preview, with snapping to the frame centre (RULE-07).
- **R3** The user can rotate the clip in 90° steps and flip it horizontally or vertically.
- **R4** The user can reset placement to its defaults.
- **R5** Scale and position can also be set with visible controls, without gestures (NFR-06).

## Acceptance criteria
- **AC1** Given a 16:9 clip in a 9:16 frame, when the user picks Fill, then it covers the frame and its sides are cut off; with Fit, then the whole clip shows with background above and below. (R1)
- **AC2** Given a selected clip, when the user drags it to within 8 screen pixels of the frame centre with snapping on, then its centre snaps to the centre lines. (R2)
- **AC3** Given a sideways clip, when the user rotates it once, then it turns 90° clockwise in the preview and in the export. (R3)
- **AC4** Given a clip scaled to 200 % and moved, when the user resets placement, then it is Fit, 100 % and centred. (R4)
- **AC5** Given keyboard only, when the user sets the scale to 150 % and nudges the position right twice, then the clip is at 150 % and its centre is 2 % of the frame's width right of centre. (R5)
- **AC6** Given Original aspect and a sideways first clip, when the user rotates it once, then the frame turns to the clip's new shape (RULE-04). (R3)

## UX notes
CMP-Inspector placement section with COPY-inspector.placement, COPY-placement.fit, COPY-placement.fill, COPY-action.rotate, COPY-action.flip_h, COPY-action.flip_v and COPY-action.reset.

## Edge cases
- A clip moved fully outside the frame → it shows only background; allowed, with no message.

## Open questions
