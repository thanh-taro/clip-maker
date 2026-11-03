---
id: ADR-0006
title: Compositor — one WebGL2 paint(t) for preview, thumbnails and every export
status: proposed
date: 2026-11-03
supersedes: []
---

## Context
INV-02 and PRN-02 require the preview and the exports to show the same picture for the same time;
NFR-08 measures it (frame within 1 frame, ΔE00 mean < 2 / max < 4). The picture combines placement
(RULE-07), twelve adjustments in a fixed order (RULE-08), a look (RULE-09), fades and cross-fades
with the background rules (RULE-04, RULE-10), and text layers (RULE-11), at up to 2160p and 60 fps
for export and smoothly for preview (NFR-03, NFR-04). Canvas 2D cannot do per-pixel grading,
3D look tables or blur fast enough on a phone. The sibling tool's answer to the same fidelity
problem was one paint function used by both screen and export (image-annotator ADR 0004); this is
the same idea on the GPU.

## Decision
1. **One function**: MOD-Compositor exposes `paint(target, framePlan, resources)`. A **frame plan**
   is computed by MOD-Plan (pure) from the project and a project time: the active clips with their
   source times, placement, grade parameters, look and intensity, layer weights from fades and
   cross-fades, the background, and the visible text layers with their opacities. Preview,
   look-gallery thumbnails, video export and GIF export all call `paint` with plans from the same
   MOD-Plan; only the target size differs. All sizes in the plan are relative to the output's
   shorter side `s` or to the frame, so the same plan renders at any resolution.
2. **API: WebGL2** on an `OffscreenCanvas` (preview: transferred from the page; export: unattached
   at output size). Required: WebGL2, 3D textures, `texImage2D` from `VideoFrame` and
   `ImageBitmap`. Optional, used when present: renderable half-float colour buffers
   (`EXT_color_buffer_half_float` / `EXT_color_buffer_float`).
3. **Passes per output frame**:
   1. *Source*: each active clip's frame becomes a texture (ADR-0007 for colour and HDR); sources
      above 3840 × 2160 are sampled down to fit (RULE-02, D-012) with a multi-tap filter.
   2. *Grade*: Temperature and Tint → Brightness, Contrast, Highlights, Shadows → Saturation,
      Vibrance → look (3D table, mixed by intensity) → Fade (RULE-08 order), into an intermediate
      texture (half-float where renderable; otherwise the grade is recomputed at each sharpen tap
      in one pass, which gives the same result without an intermediate).
   3. *Finish and place*: Sharpen (radius relative to `s`), Vignette (relative to the clip),
      Grain (below), then the RULE-07 transform (fit/fill on the rotated clip, scale, position,
      90° rotation, flips) into the frame.
   4. *Layer*: each clip's layer is the clip over its background — the background colour, or Blur:
      the graded clip scaled to cover, downsampled and blurred with a fixed separable kernel whose
      radius is relative to `s`. A clip fade mixes the layer toward the background colour (solid)
      or black (Blur); a cross-fade mixes the two layers linearly (RULE-04, RULE-10).
   5. *Text*: text layers in stacking order, each a premultiplied bitmap rendered for this output
      scale (ADR-0012), drawn with its fade opacity.
   Nothing past the project end is drawn (INV-07).
4. **Grain** is a deterministic integer hash (no `Math.random`, no time source) of the output pixel
   cell (cell size relative to `s`), the project frame index and the clip id, so it is
   pixel-identical on every play and in the export at the same resolution and time (RULE-08).
5. **Screen-only extras** are separate draws after `paint`: compare mode (RULE-08: the selected
   clip without grade and look), selection outlines, snapping guides, safe margins. Export plans
   never contain them.
6. **CPU reference**: a slow TypeScript implementation of the grade, the look sampling and the
   grain hash lives next to the shaders and is the oracle for tests (RULE-08 quality on the grey
   ramp, ΔE checks, property tests), like the suite's reference blur.
7. **Output to the encoder**: `new VideoFrame(offscreenCanvas, { timestamp, duration })` at each
   frame start (rules.md "Frame times"). If SP-gpu-color finds an engine whose RGB→YUV conversion
   or colour tags break NFR-08, that engine reads pixels back and builds an NV12/I420 frame with
   our own BT.709 conversion and explicit colour space.
8. **WebGPU** is not used in M-1 (not available on every NFR-12 target); the pass structure allows
   a later port.

## Alternatives considered
- **Canvas 2D with filters** — `filter` support differs per engine and cannot do looks, vibrance,
  highlights/shadows or deterministic grain; too slow on phones.
- **WebGPU** — cleaner API and compute shaders, but missing or partial on some NFR-12 targets in
  2026; WebGL2 is everywhere we ship.
- **Separate preview and export renderers** (e.g., a cheaper preview) — breaks INV-02 by design.
- **A third-party video effects library** — none matches RULE-08's exact order and quality
  criteria, and all would duplicate our project model.

## Consequences
- Pending condition: SP-compositor and SP-gpu-color pass (fidelity, preview frame rate, export
  throughput, precision).
- Fidelity is tested by rendering the preview path at export size and diffing against decoded
  export frames (NFR-08), plus the CPU reference.
- About 1–2k lines of shader and plan code that is ours to test; no runtime dependency.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
