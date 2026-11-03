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

## Not responsible for
- Drawing the picture (MOD-Compositor in the worker), timeline input (MOD-Timeline).

## Public surface
- `mountPreview(element, signals)`; `rasteriseText(layer, scale)` → `ImageBitmap`; `enterFullscreen()`.

## Implements
F-002.R1/R7, F-006 (preview gestures), F-007.R7 (compare), F-010.R1/R3/R5/R6, F-017 (touch on preview); RULE-07 snapping, RULE-11, RULE-21 preview gestures. Decided by ADR-0006, ADR-0012.
