---
id: F-004
title: Trim and split clips
status: shipped
milestone: M-1
priority: P0
personas: [PER-01, PER-04, PER-02]
entities: [ENT-Clip, ENT-AudioClip, ENT-TextLayer]
rules: [RULE-05, RULE-03, RULE-14, RULE-12, RULE-10, RULE-13]
screens: [SCR-Editor]
components: [CMP-Timeline, CMP-Inspector]
nfr: [NFR-06]
events: []
depends_on: [F-003]
---

## Intent
Cutting dead time from screen recordings and keeping only the good moment of phone footage is the most common edit there is (PER-01, PER-04).

## Scope
- In: trimming the start or end of a clip, text layer or audio clip; setting a photo clip's duration; splitting at the playhead; removing a middle section by splitting twice and deleting.
- Out: speed (F-005); a single "cut range" tool (M-2 candidate).

## Requirements
- **R1** The user can trim a clip's start or end. The main track stays gap-free and a video can't extend beyond its source (RULE-05).
- **R2** The user can split the selected clip, or else the main-track clip under the playhead, at the playhead (RULE-05).
- **R3** The user can trim and split text layers and audio clips the same way. Gaps are allowed on the audio track (RULE-12).
- **R4** During a trim, the item's resulting length and end time are shown, and the edge snaps per RULE-14.
- **R5** Trims and splits are frame-accurate: the edited clip starts and ends on the chosen frame in both preview and export (INV-02).
- **R6** Trim is available with visible controls that set the start or end of the selected item at the playhead, without dragging (NFR-06).
- **R7** When a clip gets shorter, its fades and cross-fades shrink per RULE-10. Text layers and audio clips keep their times (rules.md Conventions, *Fixed times*).
- **R8** The user can also set a selected photo clip's duration with a slider and a number field, within 0.1–60 s in 0.1 s steps (RULE-05); later clips move (INV-03), and a change that would pass the length limit stops there with COPY-notice.length_limited (RULE-03). Each typed value or key is one undo step, and each slider movement is one (RULE-13).

## Acceptance criteria
- **AC1** Given a 20 s video clip followed by another clip, when the user trims its start by 5 s, then it is 15 s long, starts with source time 5 s, and the next clip moves 5 s earlier. (R1)
- **AC2** Given a clip fully extended to its source end, when the user drags its end further, then it doesn't grow. (R1)
- **AC3** Given a 10 s clip at 0–10 s and the playhead at 4 s, when the user splits, then there are two clips of 4 s and 6 s with identical settings, except fades and cross-fades, which split per RULE-05. (R2)
- **AC4** Given the playhead 2 frames (0.067 s at 30 fps) from a clip's start, when the user splits, then nothing changes and COPY-notice.split_too_close is shown. (R2)
- **AC5** Given an audio clip at 2–10 s and a text layer at 1–5 s, when the user trims the audio clip's start to 4 s and splits the text at 3 s, then the audio clip is 4–10 s with a gap at 2–4 s, and the text is two layers, 1–3 s and 3–5 s. (R3)
- **AC6** Given snapping on, when a trimmed edge comes within 8 screen pixels of the playhead, then it snaps to the playhead and the length readout updates. (R4)
- **AC7** Given a 30 fps source in a 30 fps project, when its in point is set to source frame 91 (counting from 0, 3.033 s), then the clip's first frame in the preview and in the export is source frame 91. (R5)
- **AC8** Given keyboard only, when the user sets the in point and out point of the selected clip at the playhead, then the clip is trimmed accordingly. (R6)
- **AC9** Given a 4 s clip with a 1.5 s cross-fade into the next, when it is trimmed to 2 s, then the cross-fade becomes 1 s; trimmed to 5 frames (0.167 s at 30 fps), then it is removed. (R7)
- **AC10** Given clips A (0–5 s) and B, a text layer at 6–8 s and an audio clip at 6–10 s, when A's start is trimmed by 2 s, then the text is still 6–8 s and the audio clip still 6–10 s. (R7)
- **AC11** Given a 3 s photo followed by another clip, when the user types 4.5 into the photo's Duration field, then the photo lasts 4.5 s, the next clip starts at 4.5 s, and one undo restores 3 s. (R8)
- **AC12** Given a selected photo, when the user drags its Duration slider through many values, then that is one undo step and later clips follow; a drag back to where it began leaves no step. (R8)
- **AC13** Given a 3 s photo in a 9 min 58 s project, when the user sets its duration to 10 s, then it stops at 5 s and COPY-notice.length_limited is shown; typed values below 0.1 s or above 60 s are set to 0.1 s or 60 s. (R8)

## UX notes
CMP-Timeline shows trim handles on the selected item. Visible controls use COPY-action.split, COPY-action.set_in and COPY-action.set_out. A photo's Duration row (COPY-photo.duration) sits in CMP-Inspector's Edit tab and the phone Edit sheet (CMP-Inspector "photo clip").

## Edge cases
- A photo clip's trim, or its Duration row, changes its duration within 0.1–60 s (RULE-05).
- A trim that would push the project over the limit stops at the limit (RULE-03).
- A split inside a cross-fade → the cross-fade is removed.

## Open questions
