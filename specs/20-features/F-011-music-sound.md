---
id: F-011
title: Add music and set sound
status: shipped
milestone: M-1
priority: P0
personas: [PER-02, PER-03, PER-04]
entities: [ENT-AudioClip, ENT-Clip, ENT-Source, ENT-MusicTrack]
rules: [RULE-12, RULE-10, RULE-05, RULE-21]
screens: [SCR-Editor]
components: [CMP-MusicPicker, CMP-Timeline, CMP-Inspector, CMP-Toolbar]
nfr: [NFR-10, NFR-08, NFR-01, NFR-06]
events: []
depends_on: [F-001]
---

## Intent
Music sets the mood of a clip, and muting a noisy video is one of the most common quick fixes (PER-03, PER-04).

## Scope
- In: placing the user's audio and bundled music on the audio track; per-clip volume and mute; muting all original sound; the mix (RULE-12).
- Out: several audio tracks, voice-over and beat detection (M-2); speed for audio clips.

## Requirements
- **R1** The user can pick a bundled music track, preview it, and place it on the audio track per RULE-12 (at the playhead, or the end of the audio clip there, or at 0 when the playhead is at the project end).
- **R2** Audio clips can be moved, trimmed, split, duplicated and deleted on the audio track without ever overlapping (INV-06).
- **R3** The user can set the volume of, or mute, any video clip or audio clip from 0 % to 200 % (RULE-12).
- **R4** The user can mute the original sound of every clip now on the main track in one action, as one undo step; when all are muted, the same control unmutes them all (RULE-12).
- **R5** The preview and the export play the same mix, and it never clips (RULE-12, NFR-08).
- **R6** The title, source and licence of each bundled track (ENT-MusicTrack) are shown where it is picked.
- **R7** Bundled music is part of the tool and needs no network, ever (NFR-10, NFR-01).
- **R8** The user can move a selected audio clip earlier or later in time with visible controls, without dragging (RULE-21, NFR-06).

## Acceptance criteria
- **AC1** Given a 20 s project, an empty audio track and the playhead at 3 s, when the user adds a 60 s bundled track, then an audio clip from 3 s to 63 s appears; only 3–20 s is heard and exported (INV-07). (R1)
- **AC2** Given a 30 s project with audio clips at 0–5 s and 8–12 s, when the user drags the first to start at 6 s, then it is placed at 3–8 s, the free time where it fits whole nearest the requested start (RULE-12). (R2)
- **AC3** Given a video clip, when the user sets its volume to 50 %, then its sound is 6.0 dB ± 0.5 dB quieter in preview and export. (R3)
- **AC4** Given three clips with sound, when the user picks mute original sound, then all three are muted, the control now reads COPY-action.unmute_all, and one undo unmutes all three. (R4)
- **AC5** Given music at 200 % and loud video sound, when exported, then the true peak of the decoded export is ≤ −1 dBTP. (R5)
- **AC6** Given the music picker, when it opens, then every track shows its title, source and licence. (R6)
- **AC7** Given the tool offline after one full visit, when the user previews and places a bundled track, then it plays and no request is made. (R7)
- **AC8** Given a selected audio clip at 4–8 s and no other audio clips, when the user activates COPY-action.time_later, then it moves to start one frame later, following the RULE-12 move rule. (R8)
- **AC9** Given audio clips at 0–5 s and 5–30 s in a 30 s project, when the user tries to move the first to 10 s, then it stays at 0–5 s and no undo step exists. (R2)
- **AC10** Given a video clip, when the user mutes it, then it is silent in preview and export, and unmuting restores its previous volume. (R3)
- **AC11** Given a 20 s project with the playhead at its end after playback, when the user adds a bundled track, then it starts at 0. (R1)

## UX notes
CMP-Toolbar opens CMP-MusicPicker (COPY-action.music) with COPY-music.title, COPY-music.preview and COPY-music.add; volume in CMP-Inspector under COPY-inspector.sound; COPY-action.mute_all.

## Edge cases
- Less than 0.1 s free from the start point, or the playhead at or past the project end → refused with COPY-notice.no_audio_room (RULE-12).
- An audio clip past the project end → kept but not heard or exported (INV-07).
- A bundled track's file can't be read → its preview stops and COPY-notice.music_unavailable shows; during project playback the same notice shows, and the track is read again the next time the user plays. It also stops an export: the export fails with COPY-notice.music_unavailable and is never made without the track (F-015).

## Open questions
