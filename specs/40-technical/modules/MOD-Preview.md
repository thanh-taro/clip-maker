---
id: MOD-Preview
title: Preview — the preview surface, on-preview editing, text rasterising and editing
status: draft
depends_on: [MOD-Core, MOD-Project]
---

## Responsibility
Owns the preview element: transfers its canvas to the engine worker once, sizes it (CSS size ×
device pixel ratio, capped at the export's 1080 shorter side for preview), drives frame ticks from
the audio clock, and handles on-preview input: drag and pinch to move or scale the selected clip
or text, snapping to centre lines and safe margins, the compare hold, full screen (or maximised
in the page where the frame does not allow it). Rasterises text layers on the main thread into
bitmaps for the workers (ADR-0012) and hosts the transparent text field for typing.

### Rules from the spikes (2026-11-04)
Evidence: SP-frame, SP-ios.
- iPhone Safari has no page full screen: `enterFullscreen()` falls back to maximise-in-page
  (F-002.R7).
- The first user gesture on the page also unlocks audio (MOD-Audio), because iOS starts an
  `AudioContext` only inside a gesture.

## Not responsible for
- Drawing the picture (MOD-Compositor in the worker), timeline input (MOD-Timeline).

## Public surface
- `mountPreview(element, { project }, { engine, clock })` → controller (play, pause, seek, step, time and play state). `engine` is the engine worker port (MOD-Core `ToEngine` / `FromEngine` messages, so MOD-Preview never imports MOD-Engine); `clock` is MOD-Audio's `Playback`. MOD-App wires both (F-002).
- `rasteriseText(layer, scale)` → `ImageBitmap`; `enterFullscreen()`.
- On-preview placement geometry (F-006), pure, in CSS pixels of the shown frame: `screenRect(frame, picture, placement)` (the clip's box, RULE-07), `handlePoints(rect)` (the eight handles), `moveFrom(start, dx, dy, frame, snapping)` (a move measured from where the drag began, with the RULE-07 centre snap), `scaleFrom(scale, handle, centre, from, to)` and `pinchScale(scale, d0, d)` (RULE-07 scale range). MOD-App draws the outline and handles and turns the pointer input into one MOD-Project gesture per drag.

## Deferred to later features
Built in E3 without these, by scope: look thumbnails (F-008, with MOD-Plan's thumbnail plan; the engine answers with an error until then), `rasteriseText` and the text field (F-010; bitmaps are made with `premultiplyAlpha: 'premultiply'`, and the text-bitmap budget is enforced here), `enterFullscreen` (F-002.R7), and on-preview gestures (F-006, F-017). F-006 adds the clip placement geometry above; text gestures come with F-010/F-017.

## Implements
F-002.R1/R7, F-006 (preview gestures), F-007.R7 (compare), F-010.R1/R3/R5/R6, F-017 (touch on preview); RULE-07 snapping, RULE-11, RULE-21 preview gestures. Decided by ADR-0006, ADR-0012.
