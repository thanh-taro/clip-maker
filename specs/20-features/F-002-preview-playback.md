---
id: F-002
title: Play and scrub the preview
status: building
milestone: M-1
priority: P0
personas: [PER-01, PER-02, PER-03, PER-04]
entities: [ENT-Project]
rules: [RULE-04, RULE-14, RULE-21]
screens: [SCR-Editor]
components: [CMP-Preview, CMP-Timeline]
nfr: [NFR-03, NFR-08]
events: []
depends_on: [F-001]
---

## Intent
People judge an edit by watching it. The preview must play smoothly and show exactly what will be exported (PRN-02).

## Scope
- In: play and pause; moving the playhead by scrubbing, tapping or stepping; time display; full-screen preview; sound during play.
- Out: timeline zoom and snapping (F-013); keyboard shortcuts (F-017).

## Requirements
- **R1** The preview shows the project's picture at the playhead, in the project frame (RULE-04), with every clip, placement, adjustment, look, fade, cross-fade and text layer applied.
- **R2** Play starts from the playhead with picture and sound together and stops at the project end. Pause keeps the playhead where it is.
- **R3** Scrubbing updates the preview as it moves: dragging the playhead or the time ruler with a pointer, or scrolling the timeline on touch, where the playhead stays fixed at the centre (RULE-14). Clicking a time on the ruler moves the playhead there; on touch, tapping a time scrolls it to the centre.
- **R4** The user can step one frame back or forward and jump to the start or end.
- **R5** The current time and the project length are shown in minutes, seconds and frames.
- **R6** The preview and the export show the same frame for the same time (INV-02, NFR-08).
- **R7** The user can view the preview full screen (or maximised within the page where the device doesn't allow full screen) and leave it again without losing the playhead or play state.

## Acceptance criteria
- **AC1** Given a project with a clip using a look, a cross-fade and a text layer, when the playhead is inside the cross-fade, then the preview shows both clips blended with the look and the text. (R1)
- **AC2** Given a paused project with sound, when the user plays, then picture and sound start together from the playhead and stop at the project end. (R2)
- **AC3** Given playing, when the user pauses, then the playhead stays on the paused frame. (R2)
- **AC4** Given a paused project, when the user drags the playhead across a clip, then the preview follows within the NFR-03 latency. (R3)
- **AC5** Given the playhead at 2.000 s at 30 fps, when the user steps forward, then it is at 2 s + 1 frame and the time shows `00:02:01`. (R4, R5)
- **AC6** Given any project, when it is exported as video, then the frame at time t matches the preview frame at t within NFR-08. (R6)
- **AC7** Given playback, when the user enters and leaves full screen, then playback continues and the playhead is unchanged. (R7)
- **AC8** Given a phone and a paused project, when the user swipes the timeline left by one second's width, then the playhead stays centred, the time advances by 1 s and the preview follows. (R3)

## UX notes
CMP-Preview holds the picture and play controls; CMP-Timeline holds the playhead. The time uses COPY-time.position.

## Edge cases
- The device can't keep up → frames are skipped to keep sound in sync. Sound never drifts.
- Play at the project end → it starts from 0.
- Playhead at or past the project end → the preview keeps the last frame on screen; nothing past the end is drawn (INV-07).
- Empty project → the preview shows the background with COPY-empty.title.
- The system interrupts sound (a call, another app's audio, the phone locks) → playback pauses; Play resumes it.
- The phone is set to silent → the preview still plays its sound, as video apps do; the device volume controls it.

## Open questions
