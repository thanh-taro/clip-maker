---
id: F-009
title: Fade and cross-fade
status: shipped
milestone: M-1
priority: P1
personas: [PER-03, PER-02]
entities: [ENT-Clip, ENT-AudioClip, ENT-Project]
rules: [RULE-10, RULE-04, RULE-03]
screens: [SCR-Editor]
components: [CMP-Timeline, CMP-Inspector]
nfr: [NFR-08]
events: []
depends_on: [F-003]
---

## Intent
Soft starts, soft endings and gentle blends between clips are what make a family montage feel finished (PER-03).

## Scope
- In: clip fade in and out (picture and sound), cross-fades between adjacent clips, and audio clip fades.
- Out: other transition styles (M-2); text fades (F-010).

## Requirements
- **R1** The user can set a fade in and a fade out on a clip (RULE-10). The picture fades from or to the background and the sound from or to silence.
- **R2** The user can add a cross-fade between two adjacent clips, set its duration, and remove it (RULE-10).
- **R3** A cross-fade overlaps the two clips, so the project gets shorter by its duration (INV-03).
- **R4** The user can set a fade in and a fade out on an audio clip.
- **R5** Durations stay within RULE-10's limits and are applied as whole frames. Values beyond the limits are reduced to the nearest allowed value; fades and cross-fades shrink when their clip does (RULE-10).
- **R6** Removing or shortening a cross-fade never makes the project longer than RULE-03 allows.
- **R7** Between two clips where either is too short to hold the minimum cross-fade, the cross-fade is unavailable, and the reason is shown (RULE-10).

## Acceptance criteria
- **AC1** Given a clip with a 1 s fade in on a black background, when the playhead is at the clip's start, then the picture is black and silent; at 0.5 s each pixel is 50 % ± 2 % of the way from black to the clip's value and the gain is 50 % ± 2 %. (R1)
- **AC2** Given clips A (5 s) and B (5 s), when the user adds a 1 s cross-fade, then the project is 9 s and the middle second blends A into B in picture and sound. (R2, R3)
- **AC3** Given a cross-fade, when the user removes it, then the project is 10 s again. (R2)
- **AC4** Given an audio clip with a 2 s fade out, when it ends, then its volume falls to silence over its last 2 s. (R4)
- **AC5** Given clips of 1 s and 5 s, when the user sets a 2 s cross-fade, then it becomes 0.5 s. (R5)
- **AC6** Given a 9 min 59.5 s project with a 1 s cross-fade, when the user removes it, then the removal is refused with COPY-notice.length_full. (R6)
- **AC7** Given clips A and B joined by a 1 s cross-fade, with A's fade out at 1 s, when the cross-fade plays, then A's fade out is not applied and the two clips blend. (R2)
- **AC8** Given a 1 s cross-fade at 25 fps set to 0.1 s steps, when applied, then it lasts exactly 25 frames; set to 0.3 s, then 8 frames. (R5)
- **AC9** Given clips A (0.1 s) and B (5 s) at 30 fps, when the user asks for a cross-fade between them, then none is added, the project is unchanged, and COPY-notice.crossfade_too_short is shown. (R7)

## UX notes
CMP-Timeline shows a cross-fade control between adjacent clips (COPY-action.add_crossfade); where the cross-fade is unavailable, the control is disabled and COPY-notice.crossfade_too_short explains why. CMP-Inspector holds COPY-inspector.fades.

## Edge cases
- Fade in plus fade out longer than a shortened clip → both reduce in proportion (RULE-10).
- Blur background (RULE-04) during a fade → the clip and its blurred copy fade together to black.

## Open questions
