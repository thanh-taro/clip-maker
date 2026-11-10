---
id: F-012
title: Set the frame
status: building
milestone: M-1
priority: P0
personas: [PER-02, PER-04]
entities: [ENT-Project]
rules: [RULE-04, RULE-03]
screens: [SCR-Editor]
components: [CMP-Inspector, CMP-Preview]
nfr: [NFR-08]
events: []
depends_on: [F-001]
---

## Intent
Every social platform has its own shape. Switching between vertical, square and wide must take one tap (PER-02).

## Scope
- In: aspect preset, frame rate and background (RULE-04).
- Out: custom pixel sizes (export picks the resolution, F-015).

## Requirements
- **R1** The user can choose the aspect: 9:16, 1:1, 4:5, 16:9 or Original. The preview changes shape immediately and each clip keeps its placement settings (RULE-04).
- **R2** The user can choose the frame rate: 24, 25, 30 or 60. Edits stay on whole frames.
- **R3** The user can choose the background: a colour, or Blur.
- **R4** Frame changes are undo steps and never remove clips, text or audio. A frame-rate change that would push the project over 10 minutes shortens the last clip (RULE-03).

## Acceptance criteria
- **AC1** Given a 16:9 clip and Original, when the user picks 9:16, then the preview becomes vertical with the clip fitted and black above and below. (R1)
- **AC2** Given the first video recorded at 60 fps and no rate chosen, when it is added, then the frame rate is 60. (R2)
- **AC3** Given a fitted 16:9 clip in a 9:16 frame, when the user picks Blur, then the empty areas show a blurred, enlarged copy of the clip. (R3)
- **AC4** Given a 9:16 project, when the user switches to 1:1 and undoes, then it is 9:16 again with every item unchanged. (R4)
- **AC5** Given a 25 fps project of a 3-frame photo followed by a 1× video clip whose source range is 599.897 s (14,997 frames; 600 s in total), when the user switches to 24 fps, then the photo is 3 frames (0.125 s), the video, which would be 14,398 frames, is shortened at its end to 14,397 frames, the project is 600.000 s, and COPY-notice.length_limited shows. (R4)
- **AC6** Given a fitted clip in a 9:16 frame, when the user picks yellow as the background, then the empty areas are yellow in preview and export. (R3)

## UX notes
In CMP-Inspector, the frame section shows when nothing is selected: COPY-inspector.frame, COPY-frame.aspect (with COPY-frame.original), COPY-frame.rate and COPY-frame.background (with COPY-frame.blur).

## Edge cases
- Changing the frame rate moves every time to the nearest frame boundary (RULE-04). This can change lengths by a fraction of a frame.

## Open questions
