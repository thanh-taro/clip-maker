---
id: F-005
title: Change clip speed
status: ready
milestone: M-1
priority: P1
personas: [PER-02, PER-01]
entities: [ENT-Clip]
rules: [RULE-06, RULE-03, RULE-10]
screens: [SCR-Editor]
components: [CMP-Inspector]
nfr: [NFR-08]
events: []
depends_on: [F-003]
---

## Intent
Speed ramps make clips feel lively, and speeding up a slow screen recording saves the viewer's time (PER-02, PER-01).

## Scope
- In: one constant speed per video clip, with pitch kept.
- Out: speed curves (M-3); speed for photos (they have a duration instead) and audio clips.

## Requirements
- **R1** The user can set a video clip's speed from 0.25× to 4×, using quick choices or a fine control (RULE-06).
- **R2** The clip's timeline length changes to its source range divided by the speed, and later clips move to keep the track gap-free.
- **R3** The clip's sound plays at the new speed with its original pitch.
- **R4** A speed change can never make the project longer than RULE-03 allows. It stops at the slowest speed that fits, with a message.

## Acceptance criteria
- **AC1** Given a 10 s video clip, when the user picks 2×, then the clip lasts 5 s and later clips move 5 s earlier. (R1, R2)
- **AC2** Given a clip with a recorded 440 Hz tone, when it plays at 2×, then the tone is still 440 Hz ± 1 %, both in the preview and in the export. (R3)
- **AC3** Given a 9 min 30 s project with a 60 s clip, when the user sets it to 0.25×, then the speed stops at 0.70×, the clip lasts 85.7 s, the project is 9 min 55.7 s, and COPY-notice.length_limited is shown. (R4)

## UX notes
In CMP-Inspector, the speed section uses COPY-inspector.speed.

## Edge cases
- Speed on a clip that has a cross-fade → the cross-fade is shortened to stay within half of the clip (RULE-10).

## Open questions
