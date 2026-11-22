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
- `rasteriseText(layer, W, H)` → `Promise<ImageBitmap | null>`: the layer drawn for an output of W × H pixels (`s` = the shorter side), premultiplied, its centre the visible block's centre; null for empty text. `textBitmaps(layers, W, H)` → `{ id: { bitmap, s } }` for an export at that size (MOD-Export's `texts`; F-015 calls it at the output size before `start`). `layoutText(layer, W, H, measure)` (pure: lines, the block's size) and `fontOf(typeface, px)` for CMP-TextEditor's field, which must lay out as the bitmap does. `textSync(post)` keeps the engine's text bitmaps in step: a layer is rasterised again only when its pixels change (content, style, size, or the canvas size), results post in the order of the changes, the rest are kept by id (`engine:setTextBitmaps` with `keep`). `enterFullscreen()`.
- On-preview text geometry (F-010), pure, in CSS pixels of the shown frame: `moveText(start, dx, dy, frame, block, snapping)` (RULE-11: the centre to the centre lines, the nearest edge to a safe margin, within 8 screen pixels), `textSizeFrom(size, centre, from, to)` and `pinchTextSize(size, d0, d)` (RULE-11 size 2–20 %, whole percent).
- On-preview placement geometry (F-006), pure, in CSS pixels of the shown frame: `screenRect(frame, picture, placement)` (the clip's box, RULE-07), `handlePoints(rect)` (the eight handles), `moveFrom(start, dx, dy, frame, snapping)` (a move measured from where the drag began, with the RULE-07 centre snap), `scaleFrom(scale, handle, centre, from, to)` and `pinchScale(scale, d0, d)` (RULE-07 scale range). MOD-App draws the outline and handles and turns the pointer input into one MOD-Project gesture per drag.

## Deferred to later features
F-008 adds `setLookPreview(clipId | null, look)` and `lookThumbnails(clipId, t, size, onThumb, onDone)` (a later request replaces the earlier one; its bitmaps are closed) and `releaseThumbnails()`. Built in E3 without these, by scope: `rasteriseText` and the text field (F-010; bitmaps are made with `premultiplyAlpha: 'premultiply'`, and the text-bitmap budget of ADR-0009 §4 is enforced here: an LRU by bytes in `textSync`, layers near the playhead kept, the others rasterised again on a miss; MOD-App passes the device class's budget as `mountPreview`'s `textBudget`; the preview re-syncs when the near or the showing layers change — built in QA batch 2, build question 172; `textBitmaps` for an export is outside this budget, ADR-0009 note), `enterFullscreen` (F-002.R7), and on-preview gestures (F-006, F-017). F-006 adds the clip placement geometry above; F-010 the rasteriser, `textSync` and the text geometry (the text field itself is MOD-App's CMP-TextEditor, over the preview); F-017 the remaining gestures.

## Implements
F-002.R1/R7, F-006 (preview gestures), F-007.R7 (compare), F-010.R1/R3/R5/R6, F-017 (touch on preview); RULE-07 snapping, RULE-11, RULE-21 preview gestures. Decided by ADR-0006, ADR-0012.
