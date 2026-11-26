---
id: ADR-0017
title: Colour tools — computed per pixel in the one grade pass, in OKLab/OKLCh, with a per-clip hue table for the mixer and colour pop
status: accepted
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
2. **Perceptual space: OKLab / OKLCh.** RULE-24's *working perceptual colour space* is OKLab: its
   lightness scale 0–100 is OKLab L × 100, chroma is OKLCh C and hue is OKLCh h. *Lightness kept*
   and *hue reached* are judged there (L within 0.005, h within 1°); ΔE00, C* and the grey test
   stay in CIELAB. The hue ring fixture is built at CIELAB L* 60 and C* 30 for each integer OKLCh
   hue. Values are computed from the linearised working-space values in 32-bit float
   (`highp`) and converted back to sRGB encoding at the end of each colour stage that uses them
   (stages that run back to back share one conversion). OKLab is chosen for hue uniformity (blue
   does not drift to purple as in CIELAB) and smooth two-colour gradients for duotone. Out-of-gamut
   results are brought in by reducing chroma at constant L and h (binary search, 8 steps), never by
   per-channel clamping, so hue and lightness are kept (RULE-24 mixer, RULE-25 *Change*).
   *Grey gate:* the RULE-24 chroma fade (none at C* 2, full at C* 12, CIELAB) is applied as a
   smoothstep on OKLCh C between 0.0065 and 0.029, edges chosen so that every sRGB colour with
   C* < 2 gets weight 0 and every one with C* ≥ 12 gets weight 1 (C* 2 maps to OK C 0.0052–0.0061
   and C* 12 to 0.0298–0.0388 across hues and lightness); its per-step bound is in OK C units,
   1.5 ÷ 0.0225 per unit of OK C; a property test over the sRGB cube checks this.
3. **Colour mixer and colour pop: one per-clip hue table.** MOD-Plan bakes the mixer's 24 values
   and colour pop's choice, Range and Amount into a 1-D table of 1,024 entries over hue (RGBA16F:
   hue shift, chroma factor, lightness move, pop keep weight), built with RULE-24's weights (a smoothstep between neighbouring
   centres and its complement, which sum to 1) and uploaded only when those settings
   change. The shader reads it with linear filtering and wrap-around, applies the grey gate, then
   the values. One fetch replaces eight range evaluations; the table is computed by the same code
   that the CPU reference uses, so the oracle and the GPU agree by construction. Range centres are
   the OKLCh hues of RULE-24's reference colours, computed at build time.
4. **Split toning and duotone: analytic.** Split toning adds an OKLab (a, b) tint vector of each
   hue (the hue wheel colour's OKLCh hue) scaled by strength (C ≈ 0.05 at 100, about C* 20) and by
   tone weights over L: smoothstep from full at 0.15 inside the crossover (0.50 at Balance 0, 0.80
   at −100, 0.20 at +100) to none 0.15 past it, times smoothsteps to none within 0.20 of L 0 and
   L 1 (RULE-24: 20 lightness units; narrower fades break the grey-ramp bar for blue–purple
   shadow hues); L is untouched, and the result is brought into gamut by §2's chroma reduction. Duotone's gradient position is CIELAB L* ÷ 100 computed from the pixel's
   relative luminance (Y from the linear values → L*), not OKLab L, so the dark end is crossed in
   even perceived steps; the position picks an OKLab mix of the two colours (straight line in OKLab), then mixes with the input by strength
   in sRGB encoding (as look intensity does, ADR-0007 §3).
5. **Colour replace: up to three analytic matches.** Each replacement's weight is a smoothstep on
   OKLCh hue distance (full within the Range angle, fading over the Softness angle) times a
   smoothstep on chroma from ¼ to ½ of From's times the grey gate. All weights (ranges, pop,
   replace, tone) are smoothsteps, whose steepest slope is 1.5 ÷ width, meeting RULE-24's
   per-step bound. Weights are computed on the stage input;
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
   three replacements) the grade pass may add at most **5 ms per 1080p frame** on the reference
   phone (paint p50 ≤ 14 ms; amended from 2 ms / 10 ms after SP-colour-tools, below) and keep NFR-03 (≥ 24 fps phone, ≥ 30 fps laptop, 1080p, the NFR-03
   load). Pending condition: a spike, SP-colour-tools, measures this before F-024 is built. If it
   fails, the fallback is shader variants compiled per set of enabled tools (no uniform branches);
   a cheaper preview-only path is not allowed (INV-02).

## Outcome (spike SP-colour-tools, 2026-11-25)
`.build-my-app/reports/spike-colour-tools.md`: 1080p paint, median of 7 × 60 frames, all four 1.2.0 tools on.
Chrome on the reference laptop: +1.15 ms per frame with uniform branches, +1.01 ms with shader variants per
enabled-tool set (the §9 fallback, now built). Headless WebKit +3.2–3.4 ms (noisy; not a phone proxy).
The reference phone was not measured (device checks waived by the owner, QA-5); by the earlier spike's
like-for-like ratio (phone 3.7–4.3× the laptop) the phone adds about 4 ms, over the original 2 ms
budget but with paint near 12 ms, far inside NFR-03's 24 fps. Decision (orchestrator, under the owner's
standing instruction to decide by recommendation, 2026-11-25): keep the design, raise the §9 budget to
5 ms / paint p50 ≤ 14 ms, recorded as a proxy estimate, not a device measurement. NFR-03 is unchanged.
The grey gate uses CIELAB C* 2 → 12 (RULE-24's wording); the working-space chroma gate failed below
L* 10. The device effects check (RULE-22) is unchanged: colour tools cost time only when on.

*Where the code differs from §1, §3, §6 and Consequences (code review, D-053, 2026-11-25):* MOD-Compositor, not
MOD-Plan, derives each clip's stages, uniforms and hue table from `clip.colourTools` while drawing, as it already does
for the RULE-08 uniforms; MOD-Plan passes the clip unchanged. §6's *enabled* uniforms are replaced by the variants
above: one program per set of tools on, compiled the first time that set is painted (a one-off cost on the frame where
a tool is first turned on, while the user is setting it, or where a clip with that set first shows); set 0 is
compiled at start-up. The mixer and pop stage returns a pixel unchanged where the grey gate is 0, so grey pixels
skip the OKLab round trip and black never meets `atan(0, 0)`. §2's OK-chroma gate is replaced as recorded above.

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

## Amendment (2026-11-26, F-028 spec review)
Refines §5 and §7 for colour replace (RULE-25); the decision is unchanged.
- **§5 matching and change.** Range and Softness map linearly to angles: full = 5° + 0.55° × Range,
  fade = 2° + (full − 2°) × Softness ÷ 100. The chroma fade is a smoothstep from ¼ to ½ of From's
  OKLCh C; the grey fade is RULE-24's C* 2 → 12 gate. Each replacement has one turning direction:
  Δ = the shorter signed angle From → To (+180° when exactly opposite). With d = the signed angle
  From → h (|d| ≤ 120° wherever w > 0), a pixel becomes h' = h + w × (Δ − d), which lands exactly
  on To's hue at w = 1 and changes by at most about 0.24° per 0.01° of input at the defaults (a
  per-pixel shorter way would jump 77° for From 30° → To 185°). With a grey To colour h is kept.
  C' = C × ((1 − w) + w × C_to ÷ C_from); L kept; then §2's gamut reduction. Effective weights:
  w_k × (1 − Σ earlier effective weights), so the total never exceeds 1. Several replacements combine as
  shares of the pixel (build review M1, 2026-11-26): h' = h + Σ w_k (Δ_k − d_k), C' = C × (1 + Σ w_k (r_k − 1)),
  r_k = C_to ÷ C_from (0 for a grey To, whose hue term is 0), then one gamut reduction. Shader variants: one
  CT_REP bit with a fixed loop of three (unused slots weigh 0), so the grade has at most 32 programs (5 stage
  bits) and editing the count compiles nothing new.
- **§7 eyedropper.** The read region is sized to the disc, 2⌈r⌉ + 1 pixels square, not a fixed
  33 × 33; the disc is averaged in linear light, then encoded and rounded to #RRGGBB. In pick mode
  the preview paints a plan with only the selected clip's source stage over the background (a Blur
  background built from that ungraded source), with no grade, fades, other clip or text, so what is
  shown is what is sampled. ADR-0016's fixtures gain F-028's ball fixture (lightness 40 to 75).
