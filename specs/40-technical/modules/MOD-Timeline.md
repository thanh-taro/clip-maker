---
id: MOD-Timeline
title: Timeline — the main track, text lane and audio track view with pointer and touch input
status: draft
depends_on: [MOD-Core, MOD-Project, MOD-Media]
---

## Responsibility
Draws CMP-Timeline as an imperative DOM view that never re-renders Preact (ruler, playhead, text lane,
trim handles, cross-fade controls; canvas strips for clip thumbnails and audio waveforms), so each item
is a real focusable, named control (NFR-06; build question 94), and turns pointer and touch input into MOD-Project
operations with coalesced gestures: trim, move (hold 0.4 s then drag on touch), split targets,
snapping within 8 screen pixels, zoom to the RULE-14 limits. **Touch (D-013, RULE-14, RULE-21)**:
the playhead is fixed at the horizontal centre and a one-finger scroll moves the project under it,
so scrolling scrubs (pausing playback first, D-024); scroll position and playhead are one value,
with momentum ending on a frame start; a pinch zooms around the pinch point (F-013.AC4), so the time
under the centre moves with it and the pinch scrubs too; a tap on the ruler scrolls that time to the
centre. The centred playhead is the narrow layout's (CMP-Timeline "narrow", build question 174).
Pointer: draggable playhead, following during playback until a manual scroll (and again once
playback restarts or the playhead is back in view). Behaviour is chosen per input (D-026). The lanes
scroll natively; only the ruler's ticks and the thumbnail canvases near the view are made (F-013,
NFR-03, NFR-05). Exposes an accessible structure of items and the
visible equivalents of every gesture (NFR-06).

## Not responsible for
- Rule maths (MOD-Core), frame rendering (MOD-Engine), keyboard mapping (MOD-Keys).

## Public surface
- `mountTimeline(element, signals, deps)`: `signals` are MOD-Project's project, selection and playhead;
  `deps` are what MOD-Timeline may not import itself — the words (MOD-Copy formats times and labels),
  the pictures (a source's poster from MOD-Media's registry) and the edit actions (MOD-App commits them
  and shows their notices). Returns `focusClip(index)` and `dispose()`. F-009: `deps.crossFade` gives
  each join's state (cross-fade or not, its name, the reason it is unavailable), the open join, and the add
  and open actions; the view draws the add chip and the bow-tie marker, MOD-App the length popover.
- F-013: `signals` also take `zoom` (the chosen pixels per microsecond, or null to fit; MOD-App keeps it,
  RULE-23), `snapping` (RULE-14's toggle) and `playing` (the view follows the playhead). The returned view
  has the commands `zoomIn()`, `zoomOut()`, `fit()`, `scrollToPlayhead()` and `nav`, the zoom controls'
  state (Zoom in / Zoom out available, the frame width while frames are numbered, centred or not).
- `itemSpan(project, id)`: where a clip, text layer or audio clip is on the timeline (F-004: MOD-App decides from it when Start here and End here apply).

## Implements
F-002.R3 (scrubbing), F-003, F-004, F-009 controls, F-010.R4, F-011.R2, F-013, F-017 (touch); RULE-14, RULE-21; NFR-06, NFR-07. Decided by ADR-0002.
