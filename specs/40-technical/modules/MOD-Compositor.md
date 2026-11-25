---
id: MOD-Compositor
title: Compositor — the one WebGL2 paint for preview, thumbnails and exports
status: draft
depends_on: [MOD-Core, MOD-Plan]
---

## Responsibility
Draws a frame plan into a WebGL2 `OffscreenCanvas` (ADR-0006): source upload (SDR and HDR frames
alike through the browser's own conversion, `texImage2D(VideoFrame)`; 5K→2160 sampling), the grade
in RULE-08 order with the look table and intensity, sharpen, vignette, deterministic grain, the
RULE-07 transform, the clip layer over its background (colour or Blur), fades and cross-fades, then
text bitmaps in stacking order. Screen-only overlays
are separate draws. Includes the CPU reference implementation used as the test oracle, and the
timed effects check for RULE-22. From 1.2.0 the grade also runs the colour tools of RULE-24 and
RULE-25 in their order, in OKLab, with a per-clip hue table that it derives from the clip's `colourTools`
while drawing (one grade program per set of tools on), and samples the source stage for the
eyedropper (ADR-0017).

### Rules from the spikes (2026-11-04)
Evidence: SP-gpu-color, SP-hdr, SP-mem-phone, SP-ios, SP-speed (ADR-0006 / ADR-0007 outcomes).
- Grade intermediate: `RGBA16F` where renderable (all tested engines), 8-bit fallback; no
  recompute-taps. Intermediates are sized to the clip's placed size on the current target, never the
  source size; on phones the 8-bit intermediate is used above 1080 (shorter side).
- HDR and SDR frames are both uploaded with `texImage2D(VideoFrame)` (the engine's conversion); the
  decoded frame's colour space is trusted over the track's. No own 10-bit HDR shader.
- Looks: 33³ 8-bit PNG strips, uploaded as 3D textures.
- Context loss: on `webglcontextlost` prevent the default, re-create the context and re-upload
  programs, look tables, text bitmaps and intermediates; retry up to 5 times 400 ms apart. In an
  export, a loss after the first frame fails the export (COPY-error.export_failed).
- `effectsCheck()`: full RULE-08 chain + a look + Blur at 1080p on a generated bitmap, 5 warm-up + 30
  timed frames, one GPU sync at the end; `slow` when below 30 fps.
- The export target is wrapped with `new VideoFrame(offscreenCanvas, …)`; never `readPixels` for
  normal exports, never `transferToImageBitmap`.

## Not responsible for
- Choosing what to draw (MOD-Plan), decoding (MOD-Engine), rasterising text (MOD-Preview), encoding.

## Public surface
- `createCompositor(offscreenCanvas, looks)`; `paint(framePlan, frames, textBitmaps)`; `resize(w, h)`.
- `paintOverlay(overlay)` (preview only); `effectsCheck()` → `{ ok, fps, slow }`; `onContextLost(handler)` / `recover()`.
- `reference.grade(rgb, params)` (CPU oracle, tests only).

## Implements
F-002.R1/R6, F-006 (drawing), F-007.R1/R2/R5/R7, F-008.R3/R4/R6, F-009 (picture), F-010.R5 (drawing), F-012.R3 (background), F-015.R4, F-016.R1 frames, F-023.R1 (effects); RULE-04, RULE-07, RULE-08, RULE-09, RULE-10; INV-02, INV-05, INV-07; NFR-03, NFR-08. Decided by ADR-0006, ADR-0007.
