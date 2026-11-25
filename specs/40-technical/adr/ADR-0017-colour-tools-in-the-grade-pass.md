---
id: ADR-0017
title: Colour tools — computed per pixel in the one grade pass, in OKLab/OKLCh, with a per-clip hue table for the mixer and colour pop
status: proposed
date: 2026-11-25
supersedes: []
---

## Context
D-053 adds five colour tools (RULE-24, RULE-25) to every video and photo clip, inserted into the
RULE-08 chain at fixed places. INV-02 and NFR-08 require the preview and every export to apply them
identically; RULE-24 *Quality* adds bars for identity at defaults, untouched greys (ΔE00 < 0.5),
smoothness (no adjacent hue-ring or grey-ramp step more than 4× the default's step) and 8-bit
outputs within ΔE00 1 of full precision. NFR-03 must still hold at 1080p with every tool on. Today
the grade is one fragment pass (ADR-0006 §3.2, outcome item 1) into a half-float intermediate,
costing < 1 ms on the M3 and with a paint p50 of 8 ms on the reference phone; sRGB-encoded values
are the working space (ADR-0007 §1). ADR-0006 and ADR-0007 stay in force; this ADR extends their
grade pass.

## Decision
1. **Same pass, same plan.** The colour tools are stages of the existing grade pass (ADR-0006
   §3.2), in RULE-24's order: colour replace → Temperature/Tint → tone → Saturation/Vibrance →
   colour mixer → colour pop → look → split toning → duotone → Fade, before Sharpen, Vignette and
   Grain. MOD-Plan puts each clip's colour-tool parameters into the frame plan (pure, from
   `colourTools` in `project.schema.json`, absent = defaults); preview, look thumbnails (RULE-09),
   video and GIF export all call the same `paint`. No extra render pass or intermediate, so the
   8-bit fallback intermediate quantises once, as today.
2. **Perceptual space: OKLab / OKLCh.** RULE-24 *Measures* (lightness, chroma, hue) are OKLab L,
   OKLCh C and h, computed from the linearised working-space values in 32-bit float
   (`highp`) and converted back to sRGB encoding at the end of each colour stage that uses them
   (stages that run back to back share one conversion). OKLab is chosen for hue uniformity (blue
   does not drift to purple as in CIELAB) and smooth two-colour gradients for duotone. Out-of-gamut
   results are brought in by reducing chroma at constant L and h (binary search, 8 steps), never by
   per-channel clamping, so hue and lightness are kept (RULE-24 mixer, RULE-25 *Change*).
   *Grey gate:* the RULE-24 chroma fade (none at C* 2, full at C* 12, CIELAB) is applied as a
   smoothstep on OKLCh C between 0.006 and 0.03, values chosen so that every sRGB colour with
   C* < 2 gets weight 0; a property test over the sRGB cube checks this.
3. **Colour mixer and colour pop: one per-clip hue table.** MOD-Plan bakes the mixer's 24 values
   and colour pop's choice, Range and Amount into a 1-D table of 1,024 entries over hue (RGBA16F:
   hue shift, chroma factor, lightness move, pop keep weight), built with RULE-24's weights (raised
   cosine between neighbouring centres, which sums to 1) and uploaded only when those settings
   change. The shader reads it with linear filtering and wrap-around, applies the grey gate, then
   the values. One fetch replaces eight range evaluations; the table is computed by the same code
   that the CPU reference uses, so the oracle and the GPU agree by construction. Range centres are
   the OKLCh hues of RULE-24's reference colours, computed at build time.
4. **Split toning and duotone: analytic.** Split toning adds an OKLab (a, b) tint vector of each
   hue (the hue wheel colour's OKLCh hue) scaled by strength (C ≈ 0.05 at 100, about C* 20) and by
   smooth tone weights over L around the balance crossover, fading to zero below L 0.03 and above
   0.97; L is untouched. Duotone maps the incoming OKLab L through the input's own range [0, 1] to
   an OKLab mix of the two colours (straight line in OKLab), then mixes with the input by strength
   in sRGB encoding (as look intensity does, ADR-0007 §3).
5. **Colour replace: up to three analytic matches.** Each replacement's weight is a smoothstep on
   OKLCh hue distance (full within the Range angle, fading over the Softness angle) times a chroma
   floor (C ≥ ¼ of From's, smoothed) times the grey gate. Weights are computed on the stage input;
   changes apply in list order: target h, C × C_to/C_from, L kept, then gamut reduction (§2).
   Parameters arrive as uniforms; unused replacements cost nothing (`count` uniform).
6. **Skipping work.** Each tool has an *enabled* uniform derived from "not at defaults"; branches
   on uniforms are coherent and skip the OKLab round trip when no colour tool is on, so 1.1.0
   projects render bit-identically to today.
7. **Eyedropper (RULE-25).** MOD-Preview asks the engine for a sample: the compositor renders the
   selected clip's *source* stage (no grade) for a 33 × 33 region around the point mapped back
   through the RULE-07 transform at preview resolution, reads it back with `readPixels`, and
   averages a disc of radius 1 % of `s`, ignoring pixels outside the clip. Read-back is a few KB
   once per pick, never per frame. The keyboard marker and the touch magnifier use the same call
   (magnifier refreshed at most every 50 ms).
8. **Precision.** The grade intermediate stays RGBA16F where renderable; all colour-tool maths is
   float32 in the shader. The CPU reference (ADR-0006 §6) gains the five tools and is the oracle
   for RULE-24 *Quality* on the chart, the grey ramp and a new 360-step hue-ring fixture
   (ADR-0016), with property tests for the grey gate, the weights summing to 1 and monotone L.
9. **Performance budget.** With every colour tool on (24 mixer values, pop, split toning, duotone,
   three replacements) the grade pass may add at most **2 ms per 1080p frame** on the reference
   phone (paint p50 ≤ 10 ms) and keep NFR-03 (≥ 24 fps phone, ≥ 30 fps laptop, 1080p, the NFR-03
   load). Pending condition: a spike, SP-colour-tools, measures this before F-024 is built. If it
   fails, the fallback is shader variants compiled per set of enabled tools (no uniform branches);
   a cheaper preview-only path is not allowed (INV-02).

## Alternatives considered
- **Bake every colour tool into one per-clip 3-D table (33³)** — one fetch, but trilinear
  interpolation of a 33³ grid cannot hold the grey bar (ΔE00 < 0.5) near the neutral axis nor the
  hue-ring smoothness bar for narrow colour pop edges; and the table must be rebuilt on every slider
  move. Rejected.
- **CIELAB as the perceptual space** — matches the test measure, but blue hue rotation bends toward
  purple and gradients are less even; OKLab is cheaper (two 3×3 matrices and cube roots). Tests
  still judge in CIELAB with RULE-24's tolerances.
- **HSL/HSV on the sRGB values** — cheapest, but changing hue changes perceived lightness a lot
  (yellow → blue), breaking "lightness kept" (RULE-24, RULE-25).
- **A separate pass per tool** — simpler shaders, but more intermediates (memory, ADR-0009) and
  more quantisation on the 8-bit fallback.

## Consequences
- MOD-Compositor gains the stages and the hue-table texture per clip (1,024 × 8 bytes); MOD-Plan
  builds the table and parameters; MOD-Core gains the pure weight and table maths shared with the
  CPU reference; MOD-Preview gains the pick call; ADR-0016's fixtures gain the hue ring.
- WebGL context loss (ADR-0006 outcome item 6) re-uploads the hue tables like the look tables.
- Projects without `colourTools` are unchanged (§6), so 1.1.0 fidelity results stay valid.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
