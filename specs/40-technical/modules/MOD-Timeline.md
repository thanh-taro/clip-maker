---
id: MOD-Timeline
title: Timeline — the main track, text lane and audio track view with pointer and touch input
status: draft
depends_on: [MOD-Core, MOD-Project, MOD-Media]
---

## Responsibility
Draws CMP-Timeline imperatively on a canvas (ruler, playhead, clip thumbnails, text lane, audio
waveforms, trim handles, cross-fade controls) and turns pointer and touch input into MOD-Project
operations with coalesced gestures: trim, move (hold 0.4 s then drag on touch), split targets,
snapping within 8 screen pixels, zoom to the RULE-14 limits. **Touch (D-013, RULE-14, RULE-21)**:
the playhead is fixed at the horizontal centre and a one-finger scroll moves the project under it,
so scrolling scrubs (pausing playback first, D-024); scroll position and playhead are one value,
with momentum ending on a frame start; pinch zooms around the centre; a tap on the ruler scrolls
that time to the centre. Pointer: draggable playhead, following during playback until a manual
scroll. Behaviour is chosen per input (D-026). Exposes an accessible structure of items and the
visible equivalents of every gesture (NFR-06).

## Not responsible for
- Rule maths (MOD-Core), frame rendering (MOD-Engine), keyboard mapping (MOD-Keys).

## Public surface
- `mountTimeline(element, signals)`; commands `zoomIn/zoomOut/fit`, `scrollToPlayhead`.

## Implements
F-002.R3 (scrubbing), F-003, F-004, F-009 controls, F-010.R4, F-011.R2, F-013, F-017 (touch); RULE-14, RULE-21; NFR-06, NFR-07. Decided by ADR-0002.
