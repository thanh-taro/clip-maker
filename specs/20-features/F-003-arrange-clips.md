---
id: F-003
title: Arrange clips on the main track
status: building
milestone: M-1
priority: P0
personas: [PER-02, PER-03, PER-04]
entities: [ENT-Clip, ENT-Project]
rules: [RULE-05, RULE-03, RULE-10]
screens: [SCR-Editor]
components: [CMP-Timeline]
nfr: [NFR-06]
events: []
depends_on: [F-001]
---

## Intent
Joining clips in the right order is the core of every family montage and social clip (PER-02, PER-03).

## Scope
- In: selecting, reordering, deleting and duplicating clips on the main track; keeping the track gap-free.
- Out: trimming and splitting (F-004); text and audio clips (F-010, F-011).

## Requirements
- **R1** The user can select a clip. The selection is shown on the timeline and decides what clip settings act on.
- **R2** The user can move a clip to another boundary on the main track (RULE-05).
- **R3** The user can delete a clip. Later clips move earlier so there is no gap (INV-03).
- **R4** The user can duplicate a clip. The copy goes right after the original and keeps every setting, within the length limit (RULE-03).
- **R5** Moving, deleting and duplicating clips update cross-fades per RULE-05, and never make the project longer than RULE-03 allows.
- **R6** Reorder, delete and duplicate are each available without a drag gesture (NFR-06).

## Acceptance criteria
- **AC1** Given clips A, B and C, when the user moves C to the start, then the order is C, A, B with no gaps. (R2)
- **AC2** Given clips A, B and C, when the user deletes B, then A and C are adjacent and the project is shorter by B's length. (R3)
- **AC3** Given clip A with a look and speed 2×, when the user duplicates it, then a copy with the same look and speed follows A. (R4)
- **AC4** Given a cross-fade between A and B, when B is moved after C, then the A–B cross-fade is removed. (R5)
- **AC5** Given a screen reader or keyboard only, when the user moves a clip one place left, deletes it and duplicates another, then each works through visible controls. (R6, R1)
- **AC6** Given clips A, B and C with cross-fades A–B and B–C, when B is deleted, then A and C are adjacent with no cross-fade. (R5)
- **AC7** Given clip A with a cross-fade into B, when A is duplicated, then the order is A, A′, B, with no cross-fade between A and A′ and A′ cross-fading into B. (R5)
- **AC8** Given a 9 min 59.5 s project whose only cross-fade is 1 s, when a reorder would remove it, then the reorder is refused with COPY-notice.length_full. (R5)

## UX notes
On CMP-Timeline, clips show a thumbnail and their duration. Clip actions use COPY-action.move_left, COPY-action.move_right, COPY-action.delete and COPY-action.duplicate.

## Edge cases
- Deleting the last clip → the main track is empty; text layers and audio clips stay, past the project end (INV-07).
- Duplicating near the length limit → the copy is shortened at its end when at least one frame fits (COPY-notice.length_limited), otherwise refused (COPY-notice.length_full).

## Open questions
