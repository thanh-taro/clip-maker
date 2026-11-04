---
id: F-016
title: Export an animated image or audio
status: ready
milestone: M-1
priority: P2
personas: [PER-01, PER-04]
entities: [ENT-ExportSettings]
rules: [RULE-16, RULE-12, RULE-19]
screens: [SCR-Editor]
components: [CMP-ExportPanel, CMP-ExportProgress]
nfr: [NFR-11, NFR-01, NFR-08]
events: []
depends_on: [F-015]
---

## Intent
A short looping animated image drops into chats and issue trackers where video won't play (PER-01). Extracting the sound covers the "I just need the audio" job (PER-04).

## Scope
- In: GIF export of a range of up to 15 s; audio-only export of the whole mix (RULE-16).
- Out: other animated formats (M-2).

## Requirements
- **R1** The user can export a range of up to 15 s as a looping GIF, choosing its size and frame rate (RULE-16).
- **R2** The user can export the project's sound alone, in a compressed format or as WAV (RULE-16).
- **R3** Both exports share video export's progress, cancel, failure handling, sharing and scratch-space cleanup (F-015.R3, F-015.R6, F-015.R7, F-015.R9).
- **R4** A GIF export never clears unexported changes; an audio export does, like a video export (RULE-19).

## Acceptance criteria
- **AC1** Given a 40 s project with the playhead at 10 s, when the user picks GIF, then the range is 10–25 s, adjustable to at most 15 s, and the exported file loops at the chosen size and frame rate. (R1)
- **AC2** Given a project with music and clip sound, when the user exports audio as WAV, then the file holds the RULE-12 mix as 16-bit, 48 kHz stereo. (R2)
- **AC3** Given a running GIF export, when the user cancels, then it stops within 1 s and nothing is saved. (R3)
- **AC4** Given a 40 s project and a GIF just exported with no other changes, when the user closes the tab, then the leave-page warning still appears. (R4)
- **AC5** Given an exported GIF, when its frames are compared with the preview, then each frame is within one GIF frame of its preview time (NFR-08). (R1)
- **AC6** Given unexported changes, when the user exports audio successfully and closes the tab, then no warning appears. (R4)

## UX notes
CMP-ExportPanel has COPY-export.kind_video, COPY-export.kind_gif and COPY-export.kind_audio; GIF settings use COPY-export.gif_range, COPY-export.gif_size and COPY-export.gif_rate.

## Edge cases
- A project with no unmuted, non-silent sound, or with an empty main track → audio export is unavailable, with COPY-notice.no_sound_to_export or COPY-notice.needs_clip.

## Open questions
