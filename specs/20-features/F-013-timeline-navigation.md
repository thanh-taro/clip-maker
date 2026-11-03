---
id: F-013
title: Navigate the timeline
status: ready
milestone: M-1
priority: P1
personas: [PER-01, PER-02]
entities: [ENT-Project]
rules: [RULE-14, RULE-21]
screens: [SCR-Editor]
components: [CMP-Timeline]
nfr: [NFR-06, NFR-07]
events: []
depends_on: [F-002]
---

## Intent
Precise edits need zoom, and fast edits need snapping. Both must work by pointer, keyboard and touch (PRN-06).

## Scope
- In: timeline zoom, fitting the project, scrolling, snapping, following the playhead (RULE-14).
- Out: keyboard map (F-017).

## Requirements
- **R1** The user can zoom the timeline in and out within the range of RULE-14, and fit the whole project.
- **R2** The user can scroll the timeline. While playing, the view follows the playhead; a manual scroll stops following until playback restarts or the playhead is back in view (RULE-14). On touch, the playhead stays centred and scrolling scrubs (RULE-14).
- **R3** Snapping works per RULE-14, by the start and end of the dragged item, and can be turned on or off for both the timeline and the preview.
- **R4** On touch, a pinch zooms the timeline and a one-finger drag scrolls it (RULE-21).

## Acceptance criteria
- **AC1** Given a 5-minute project, when the user zooms in fully, then one frame is at least 12 screen pixels wide; when the user fits, then the whole project is visible. (R1)
- **AC2** Given a pointer, zoomed in and playing, when the playhead reaches the view's edge, then the view scrolls to keep it visible. (R2)
- **AC3** Given snapping off, when a clip edge is dragged near the playhead, then it doesn't snap. (R3)
- **AC4** Given a phone, when the user pinches out on the timeline, then it zooms in around the pinch point. (R4)
- **AC5** Given a pointer, playing and zoomed in, when the user scrolls away from the playhead, then the view stays where the user scrolled until playback restarts or the playhead re-enters the view. (R2)
- **AC6** Given snapping off, when a text layer is dragged near the frame's centre line in the preview, then it doesn't snap. (R3)
- **AC7** Given a phone and playback running, when the user swipes the timeline, then playback pauses and the playhead time follows the swipe while staying centred. (R2)

## UX notes
CMP-Timeline zoom controls use COPY-action.zoom_in, COPY-action.zoom_out and COPY-action.zoom_fit, and the snapping toggle uses COPY-action.snapping.

## Edge cases
- Empty project → zoom controls are unavailable.

## Open questions
