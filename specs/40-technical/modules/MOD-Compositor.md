---
id: MOD-Compositor
title: Compositor — the one WebGL2 paint for preview, thumbnails and exports
status: draft
depends_on: [MOD-Core, MOD-Plan]
---

## Responsibility
Draws a frame plan into a WebGL2 `OffscreenCanvas` (ADR-0006): source upload (SDR fast path, own
HDR→SDR shader, 5K→2160 sampling), the grade in RULE-08 order with the look table and intensity,
sharpen, vignette, deterministic grain, the RULE-07 transform, the clip layer over its background
(colour or Blur), fades and cross-fades, then text bitmaps in stacking order. Screen-only overlays
are separate draws. Includes the CPU reference implementation used as the test oracle, and the
timed effects check for RULE-22.

## Not responsible for
- Choosing what to draw (MOD-Plan), decoding (MOD-Engine), rasterising text (MOD-Preview), encoding.

## Public surface
- `createCompositor(offscreenCanvas, looks)`; `paint(framePlan, frames, textBitmaps)`; `resize(w, h)`.
- `paintOverlay(overlay)` (preview only); `effectsCheck()` → `{ ok, fps }`.
- `reference.grade(rgb, params)` (CPU oracle, tests only).

## Implements
F-002.R1/R6, F-006 (drawing), F-007.R1/R2/R5/R7, F-008.R3/R4/R6, F-009 (picture), F-010.R5 (drawing), F-012.R3 (background), F-015.R4, F-016.R1 frames, F-023.R1 (effects); RULE-04, RULE-07, RULE-08, RULE-09, RULE-10; INV-02, INV-05, INV-07; NFR-03, NFR-08. Decided by ADR-0006, ADR-0007.
