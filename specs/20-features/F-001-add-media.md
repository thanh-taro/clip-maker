---
id: F-001
title: Add media
status: ready
milestone: M-1
priority: P0
personas: [PER-01, PER-02, PER-03, PER-04]
entities: [ENT-Source, ENT-Clip, ENT-AudioClip, ENT-Project]
rules: [RULE-01, RULE-02, RULE-03, RULE-05, RULE-12, RULE-13, RULE-22]
screens: [SCR-Editor]
components: [CMP-MediaPanel, CMP-DropOverlay, CMP-EmptyState, CMP-Notice]
nfr: [NFR-01, NFR-05, NFR-03]
events: []
depends_on: [F-023]
---

## Intent
Every edit starts with getting footage, photos and sound in. That must take one gesture on any device and must never upload anything (PRN-01, PRN-03).

## Scope
- In: picking files, dropping files, and pasting files; video, photo and audio sources; several files at once; checking each file; placing new media on the timeline; the media panel listing sources; removing a source.
- Out: recording from a camera or microphone (M-2); links or web media, which are never fetched (NFR-01); bundled music (F-011).

## Requirements
- **R1** The user can add one or more files by picking them, dropping them on the tool, or pasting them.
- **R2** Each file is checked by its contents against RULE-01 and RULE-02 before it is used. Refused files are named with the reason, and accepted files from the same batch are still added.
- **R3** Accepted video and photo sources are placed on the main track and audio sources on the audio track, per RULE-05 and RULE-12, within the project length limit (RULE-03).
- **R4** Every added source is listed in the media panel with its kind, name and duration. From there it can be placed again or removed. Removing a source also removes its clips.
- **R5** Adding media never changes, copies off the device, or keeps the source file beyond the session (INV-01).
- **R6** While sources are being checked, the tool shows progress and stays usable, and the user can cancel. Cancel keeps the files whose check has finished and drops the one being checked and the rest. A batch is one undo step (RULE-13).
- **R7** Large sources are read piece by piece, so adding a file never needs memory proportional to its size (NFR-05).

## Acceptance criteria
- **AC1** Given an empty project, when the user picks a phone video, then it appears in the media panel and as the only clip on the main track, starting at 0. (R1, R3, R4)
- **AC2** Given a project with one 10 s clip and the playhead at 4 s, when the user drops two videos, a photo and an MP3 at once, then the videos and photo are added to the main track in the order given and the MP3 to the audio track at the playhead. (R1, R3)
- **AC3** Given a batch with a HEIC photo, a PDF renamed to .mp4 and a valid video, when the batch is added, then the valid video is added and COPY-error.refused_list names the other two with their reasons (COPY-reason.unsupported). (R2)
- **AC4** Given a 5 GB file, when it is added, then it is refused with COPY-reason.too_large and the project is unchanged. (R2)
- **AC5** Given a project 9 min 50 s long, when the user adds a 30 s video, then the clip is trimmed to its first 10 s and COPY-notice.length_limited is shown. (R3)
- **AC6** Given a source with two clips on the main track, when the user removes it from the media panel, then both clips are gone, the main track has no gaps, and one undo restores both. (R4)
- **AC7** Given a full session of adding media, when the network log is inspected, then there are no requests beyond the tool's own files (NFR-01) and none carries file content. (R5)
- **AC8** Given the user is adding five large files, when the second is being checked, then progress is visible and the user can play the preview; when the user cancels, then only the first file is added, and one undo removes it. (R6)
- **AC9** Given the reference phone, when the user adds a 3.5 GB 4K video, then memory use stays within the NFR-05 budget and the source is added without the page being closed. (R7)
- **AC10** Given the tool is focused, when the user pastes a copied video file, then it is added; when the clipboard holds only text or a link, then nothing is fetched and nothing is added. (R1, R5)
- **AC11** Given an empty project, when the user adds an MP3 of 2 minutes, then an audio clip from 0 s to 2 min is placed on the audio track, past the project end (INV-07), and export stays unavailable with COPY-notice.needs_clip. (R3)
- **AC12** Given a project with 100 sources, when the user adds another file, then it is refused with COPY-reason.too_many. (R2)
- **AC13** Given a 5120 × 2880 screen recording, when it is added, then it is accepted and used scaled to 3840 × 2160. (R2)
- **AC14** Given a source in the media panel, when the user places it again, then a new clip of the whole source is added at the end of the main track (audio is placed per RULE-12), as one undo step. (R4)

## UX notes
The empty project shows CMP-EmptyState with COPY-empty.title and COPY-action.add_media. Drag-over shows CMP-DropOverlay with COPY-drop.hint. The media panel is CMP-MediaPanel. Results use CMP-Notice.

## Edge cases
- The same file added twice → two separate sources.
- A video whose sound can't be decoded → added silent, with COPY-notice.no_sound.
- Dropping a folder → ignored, with COPY-reason.folder.
- Adding while the project is at the 10-minute limit → refused with COPY-notice.length_full.
- An HDR phone video → added and shown in standard range (RULE-01).
- A video larger than 3840 × 2160 (up to 5120 × 2880) → accepted and used scaled down (RULE-02); on some devices its preview plays below the NFR-03 rate (COPY-notice.slow_device, RULE-22); its exports are unaffected.
- A photo over the size limit → scaled down on load (RULE-02); no message needed.

## Open questions
