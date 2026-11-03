---
id: ADR-0007
title: Colour — sRGB working space, 3D look tables, HDR converted to standard range by our own shader
status: proposed
date: 2026-11-03
supersedes: []
---

## Context
RULE-08 fixes the adjustment order and quality bars on an 8-bit grey ramp; RULE-09 wants at least
16 looks with an intensity; NFR-08 wants preview and export colours within ΔE00 mean < 2;
NFR-10 limits typefaces plus look data to 1.5 MB; D-014 and RULE-01 want high-dynamic-range
sources converted to standard range the same way in the preview and every export. Phones record
HLG or PQ HEVC (BT.2020); browsers differ in what they do when such a frame is uploaded to an sRGB
canvas (clip, tone-map, or show washed-out colour).

## Decision
1. **Working space**: gamma-encoded sRGB / BT.709 primaries, values in floating point inside the
   shaders; every canvas and texture upload is `srgb` (`drawingBufferColorSpace`,
   `unpackColorSpace`). Grading happens on encoded values, which is what users of consumer editors
   expect for sliders. Outputs are tagged BT.709 (SDR, RULE-01).
2. **Adjustment formulas** are defined once in the CPU reference (ADR-0006) and mirrored in GLSL:
   Temperature/Tint as a white-balance gain in a chromatic adaptation space, Brightness/Contrast as
   a monotone tone curve around mid-grey, Highlights/Shadows as smooth luminance-weighted curves,
   Saturation/Vibrance in a luminance-preserving chroma space, Fade as a black lift, Sharpen as
   unsharp mask, Vignette as a smooth radial gain. Every curve is monotone in luminance by
   construction, which property tests check against RULE-08's four quality bars.
3. **Looks**: each look is a 33 × 33 × 33 RGB table authored by us (looks.md intents, owner
   sign-off in design), stored as an 8-bit PNG strip (one file per look, about 50–70 KB each,
   ≤ 1.2 MB for 16), uploaded as a 3D texture with trilinear filtering. Intensity mixes the table's
   output with its input linearly. The build converts the authored `.cube` files and checks the
   table at 0 equals identity within ΔE00 < 0.5 (RULE-09: intensity 0 = None). If SP-gpu-color shows
   banding from 8-bit storage, the tables move to 16-bit PNG or 25³ (budget decides).
4. **HDR to standard range (D-014)**: a source is HDR when its colour space says transfer `pq` or
   `hlg`, or primaries `bt2020`. Preferred path: copy the decoded frame's 10-bit planes
   (`VideoFrame.copyTo`) into integer textures and convert in our own shader: BT.2020 YCbCr → RGB →
   PQ or HLG to linear light (reference white 203 cd/m²) → a fixed tone curve (BT.2390-style
   shoulder) → BT.2020 to BT.709 gamut mapping with soft clipping → sRGB encoding. The same shader
   runs in preview and export, so the result is identical within an engine and very close across
   engines. Fallback where planes are not readable: the browser's own conversion on upload, used
   for both preview and export on that engine (still INV-02-consistent). SP-hdr decides per engine.
5. **SDR sources** use the browser's YCbCr→RGB conversion on upload (`texImage2D(VideoFrame)`), the
   fast path; full/limited range and BT.601/709 tags are honoured by the engine. SP-gpu-color checks
   the result against a test chart.

## Alternatives considered
- **Linear-light working space** — physically nicer blending, but slider behaviour departs from
  what PER-02 expects, costs precision in 8-bit fallbacks, and RULE-10 only asks for straight lines.
- **Parametric looks (no tables)** — smaller, but limits the "trending" looks the owner wants
  (D-009) and the designer's control.
- **Relying on the browser for HDR everywhere** — results differ between engines and sometimes
  between preview and encoder input on the same engine; D-014 asks for one conversion.

## Consequences
- Looks are data files authored in design, versioned with their checksums in `dependencies.md`.
- HDR costs one CPU copy of the frame planes per frame; SP-hdr measures it on phones (4K HLG is the
  worst case).
- Colour fidelity tests use a 24-patch chart rendered through both paths (NFR-08).

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
