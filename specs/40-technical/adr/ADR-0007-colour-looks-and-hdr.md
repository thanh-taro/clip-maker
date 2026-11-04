---
id: ADR-0007
title: Colour — sRGB working space, 3D look tables, HDR converted to standard range by the engine (own shader dropped after SP-hdr)
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

## Outcome (spikes, 2026-11-04)
Evidence: SP-gpu-color, SP-hdr (automated + iPhone 14 Pro Safari 27.0.1), SP-mem-phone.

**Measured:**
- Working space and SDR fast path (§1, §5) pass NFR-08 everywhere (chart mean ≤ 0.73, max ≤ 1.94;
  iPhone max ≤ 1.65). The engine's RGB→YUV matrix is BT.709 (own BT.709 conversion within ΔE00
  0.12–0.24; BT.601 would be 2.2–2.7 off).
- **Output tags differ by encoder**: primaries bt709 and matrix bt709 everywhere; transfer is tagged
  **13 (sRGB)** by every engine; Chrome's hardware H.264 writes **limited** range, WebKit and
  openh264 write **full** range.
- **Looks** (§3): authored 33³ tables as 8-bit PNG strips are **3.7–15.1 KB** (not 50–70 KB);
  16 looks ≈ 60–240 KB. 8-bit storage error vs the float table: ΔE00 mean 0.08, max 0.78; no
  banding.
- **RULE-08 ramp bars** hold at every adjustment's min and max in the float CPU reference and on the
  GPU's half-float layer, in all three engines. On any 8-bit output two bars (distinct steps; max
  step ≤ 2× default) fail by arithmetic, not precision: any slope below 1 merges codes, and
  limited-range export alone merges 36 of 256 levels at default.
- **HDR (§4)**: decoded HLG HEVC frames are **opaque** (`format: null`) in Chrome and WebKit on
  macOS, so the 10-bit planes cannot be read; on **iOS the decoder itself tone-maps** to 8-bit NV12
  tagged bt709 / sRGB / full range. Engine path, preview vs export: ΔE00 mean 0.26 / max 0.86
  (Chrome), 0.43 / 1.16 (WebKit), **0.42 / 1.40 (iPhone)**; Chrome vs WebKit 0.13 mean. HDR upload
  cost: WebKit macOS 24–26 ms per 4K frame (vs 5.6 ms SDR); iPhone 1.1 ms (same as SDR).

**Rule changes:**
1. **§4 rewritten — HDR via the engine's conversion everywhere.** A source is HDR when the
   *decoded frame's* colour space says transfer `pq`/`hlg` or primaries `bt2020`; the frame's tag is
   trusted over the track's (iOS frames arrive already SDR). HDR frames are uploaded with
   `texImage2D(VideoFrame)` into the `srgb` working space, the same call in preview, thumbnails and
   every export, so D-014 holds by construction within an engine. The own 10-bit shader is **not
   built**; adopting it later (an engine that exposes 10-bit planes and converts badly) needs a
   superseding ADR. PQ sources are untested (no fixture); Firefox and Android HDR untested (D-037).
2. **§1 output tags**: MOD-Export writes the `colr`/VUI tags explicitly: primaries 1 (BT.709),
   matrix 1 (BT.709), range = what the encoder produced (probed per engine), transfer **1 (BT.709)**
   as the interim value. The owner's player check (QuickTime, Photos, VLC/IINA on the chart MP4)
   decides at G3/QA between transfer 1 and 13 and whether full-range output needs our own
   limited-range conversion on WebKit (ADR-0006 outcome item 3). Until then exports are tagged as
   produced plus transfer 1.
3. **§3 looks budget**: keep 33³ 8-bit PNG strips; **budget 30 KB per look** (16 ≈ 0.5 MB, inside
   NFR-10 with fonts). The build rejects a look over 108 KB (the incompressible bound) or whose
   8-bit storage error exceeds ΔE00 1 against its float table. The 16-bit/25³ alternative is not
   needed.
4. **RULE-08 measurement**: the ramp bars are judged on the high-precision render (CPU reference and
   the half-float layer) with Grain 0 and Vignette per position; 8-bit outputs are judged by
   reversal ≤ ΔL* 0.5 and ΔE00 ≤ 1 against the reference. This needs the RULE-08 / F-007.AC2 spec
   change proposed at G3 (`.build-my-app/reports/g3-spec-changes.md`).
