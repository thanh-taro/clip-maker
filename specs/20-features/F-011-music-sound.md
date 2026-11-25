---
id: F-011
title: Add music and set sound
status: shipped
milestone: M-1
priority: P0
personas: [PER-02, PER-03, PER-04]
entities: [ENT-AudioClip, ENT-Clip, ENT-Source]
rules: [RULE-12, RULE-10, RULE-05, RULE-21, RULE-01, RULE-02, RULE-13]
screens: [SCR-Editor]
components: [CMP-Timeline, CMP-Inspector, CMP-Toolbar, CMP-MediaPanel]
nfr: [NFR-08, NFR-01, NFR-06]
events: []
depends_on: [F-001]
---

## Intent
Music sets the mood of a clip, and muting a noisy video is one of the most common quick fixes (PER-03, PER-04). Music comes only from the user's own audio files, so the tool ships no music that could draw a claim on an export (D-052).

## Scope
- In: placing the user's audio on the audio track, including from the Music action; per-clip volume and mute; muting all original sound; the mix (RULE-12).
- Out: several audio tracks, voice-over and beat detection (M-2); speed for audio clips; music shipped with the tool (removed by D-052).

## Requirements
- **R1** The Music action lets the user pick one or more of their own audio files. Each file goes through the F-001 intake (RULE-01, RULE-02 checks; accepted files are listed in the media panel as sources) and is placed on the audio track per RULE-12 *Placing on the audio track*. Several files are placed in the order given, each per RULE-12, so they follow one another from the playhead. The whole pick is one undo step (RULE-13), and the first new audio clip is selected; if no audio clip is placed, the selection doesn't change. Files without room give one COPY-notice.no_audio_room for the pick. Cancelling the picker changes nothing.
- **R2** Audio clips can be moved, trimmed, split, duplicated and deleted on the audio track without ever overlapping (INV-06).
- **R3** The user can set the volume of, or mute, any video clip or audio clip from 0 % to 200 % (RULE-12).
- **R4** The user can mute the original sound of every clip now on the main track in one action, as one undo step; when all are muted, the same control unmutes them all (RULE-12).
- **R5** The preview and the export play the same mix, and it never clips (RULE-12, NFR-08).
- **R6** Retired by D-052 (2026-11-25); the ID is not reused. It required the credits of each track shipped with the tool to be shown where the track was picked; the tool ships no music now.
- **R7** Retired by D-052 (2026-11-25); the ID is not reused. It required the tracks shipped with the tool to work with no network; the tool ships no music now.
- **R8** The user can move a selected audio clip earlier or later in time with visible controls, without dragging (RULE-21, NFR-06).

## Acceptance criteria
- **AC1** Given a 20 s project, an empty audio track and the playhead at 3 s, when the user activates COPY-action.music and chooses a 60 s MP3, then it is listed in the media panel and an audio clip from 3 s to 63 s appears, selected; only 3–20 s is heard and exported (INV-07); one undo removes the clip and the source. (R1)
- **AC2** Given a 30 s project with audio clips at 0–5 s and 8–12 s, when the user drags the first to start at 6 s, then it is placed at 3–8 s, the free time where it fits whole nearest the requested start (RULE-12). (R2)
- **AC3** Given a video clip, when the user sets its volume to 50 %, then its sound is 6.0 dB ± 0.5 dB quieter in preview and export. (R3)
- **AC4** Given three clips with sound, when the user picks mute original sound, then all three are muted, the control now reads COPY-action.unmute_all, and one undo unmutes all three. (R4)
- **AC5** Given music at 200 % and loud video sound, when exported, then the true peak of the decoded export is ≤ −1 dBTP. (R5)
- **AC6** Retired by D-052 (2026-11-25); the ID is not reused. Was: given the list of tracks shipped with the tool, when it opened, then every track showed its title, source and licence. (R6)
- **AC7** Retired by D-052 (2026-11-25); the ID is not reused. Was: given the tool offline after one full visit, when the user previewed and placed a shipped track, then it played and no request was made. (R7)
- **AC8** Given a selected audio clip at 4–8 s and no other audio clips, when the user activates COPY-action.time_later, then it moves to start one frame later, following the RULE-12 move rule. (R8)
- **AC9** Given audio clips at 0–5 s and 5–30 s in a 30 s project, when the user tries to move the first to 10 s, then it stays at 0–5 s and no undo step exists. (R2)
- **AC10** Given a video clip, when the user mutes it, then it is silent in preview and export, and unmuting restores its previous volume. (R3)
- **AC11** Given a 20 s project with the playhead at its end after playback, when the user adds an audio file with COPY-action.music, then it starts at 0. (R1)
- **AC12** Given any project, when the user activates COPY-action.music and cancels the picker, then the project, the media panel and the undo history are unchanged. (R1)
- **AC13** Given a 20 s project, an empty audio track and the playhead at 2 s, when the user chooses a 5 s and a 4 s audio file with COPY-action.music, then both are listed in the media panel, audio clips appear at 2–7 s and 7–11 s in the order given, the first is selected, and one undo removes both clips and both sources. (R1)
- **AC14** Given a 20 s project with an audio clip from 0 s to 20 s and the playhead at 5 s, when the user chooses a 10 s MP3 with COPY-action.music, then COPY-notice.no_audio_room shows, the MP3 is listed in the media panel, no audio clip is added, and one undo removes the source. (R1)
- **AC15** Given a 20 s project, an empty audio track and the playhead at 3 s, when the user chooses a 30 s MP3 and then a 10 s MP3 with COPY-action.music, then the first is placed at 3–33 s, the second is listed in the media panel with COPY-notice.no_audio_room and no clip, and one undo removes both sources and the clip. (R1)
- **AC16** Given an empty audio track, when the user chooses a valid MP3 and a PDF renamed .mp3 with COPY-action.music, then the MP3 is placed and COPY-error.refused_list names the PDF with COPY-reason.unsupported. (R1)

## UX notes
CMP-Toolbar's Music (COPY-action.music) opens the system file picker for audio files; on narrow layouts it is in the Audio sheet (CMP-Inspector "narrow sheets"). New sources appear in CMP-MediaPanel. Volume in CMP-Inspector under COPY-inspector.sound; COPY-action.mute_all.

## Edge cases
- Less than 0.1 s free from the start point, or the playhead at or past the project end → that file's placement is refused with COPY-notice.no_audio_room (RULE-12); the file is still kept as a source (RULE-01).
- A chosen file refused by RULE-01 or RULE-02 → named with its reason as in F-001; the other files are still added.
- A chosen file that RULE-01 reads as video or photo (the picker's restriction is a hint) → handled as F-001 handles it.
- An audio clip past the project end → kept but not heard or exported (INV-07).

## Open questions
