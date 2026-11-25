# SP-colour-tools — grade-pass cost and fidelity of the colour tools (ADR-0017 §9, D-053)

**Question.** With every colour tool of 1.2.0 on (24 mixer values, colour pop, split toning, duotone), does the
one grade pass of ADR-0017 stay within **+2 ms per 1080p frame on the reference phone** (paint p50 ≤ 10 ms) and
keep NFR-03? Does the GPU match the CPU oracle and the export match the preview (RULE-24 *Quality*, NFR-08)?

**Verdict: the budget is not met by proxy, even with the ADR's fallback (shader variants).** Fidelity passes
everywhere. ADR-0017 stays `proposed`; see *Decision needed*.

## Set-up
- Mac: MacBook (Apple M3, 8 cores), load average 2.7–6.8 during the runs (other agents present). The reference
  phone (iPhone 14 Pro) was not available: device checks are waived by the owner (QA-5), so the phone is judged
  by proxy only.
- Harness: `tests/harness/export.ts` `colourToolsBench(runs, frames)`, run by
  `tests/e2e/colour-tools.spec.ts` "ADR-0017 §9 @realtime …" (one engine at a time, `--no-deps`). It paints a
  1920 × 1080 photo-like picture (a hue sweep with dark-to-light gradients) into a 1920 × 1080 target with every
  RULE-08 adjustment on and a look at 80, for six configurations: tools off, each tool alone, all on. Each run
  paints every configuration in turn (interleaved, so load drift hits all alike): 5 warm-up paints, then
  `frames` timed paints and one GPU sync. The grade pass is the only pass whose work differs between
  configurations, so *added* = median(config) − median(off).
- Engines: branded Chrome 156 (ANGLE Metal, Apple M3 — the GPU-timing engine of ADR-0016), Playwright WebKit
  (Apple GPU, headless), Playwright Chromium (SwiftShader, software GL — recorded, not a GPU measure).

## Results (median of 7 runs × 60 frames; ms per 1080p paint)

| Engine | Shader | off | mixer | pop | split | duotone | **all on** | **added (all on)** |
|---|---|---|---|---|---|---|---|---|
| Chrome (M3) | uniform branches (ADR §6) | 1.43 | 2.05 | 1.69 | 1.77 | 1.55 | 2.58 | **+1.15** |
| Chrome (M3) | variants per tool set (ADR §9 fallback) | 1.42 | 1.93 | 1.62 | 1.69 | 1.52 | 2.43 | **+1.01** |
| Chrome (M3) | variants + cheaper gamut loop | 1.35 | 1.90 | 1.58 | 1.66 | 1.53 | 2.43 | **+1.08** |
| WebKit (M3, headless) | uniform branches | 5.62 | 8.18 | 7.02 | 7.25 | 6.43 | 8.85 | **+3.23** |
| WebKit (M3, headless) | variants | 5.53 | 8.03 | 6.85 | 7.02 | 6.57 | 8.97 | **+3.43** |
| Chromium (SwiftShader) | variants, 5 runs × 5 frames | 66.8 | 95.0 | 83.2 | 86.0 | 79.6 | 127.1 | +60.3 (×1.90) |

Run spread: Chrome within ±0.15 ms; WebKit wide (all-on runs 7.3–11.1 ms), as in SP-gpu-color (headless WebKit's
upload and sync dominate its numbers).

### Phone budget, by proxy
- **Like-for-like proxy (preferred):** SP-gpu-color's effects check (1080p chain, look, Blur, bitmap upload each
  frame) ran at 486–553 fps in Chrome on the M3 and **128 fps on the iPhone 14 Pro**: the phone is ≈ 3.7–4.3×
  slower. Applied to Chrome's added +1.0–1.1 ms → **≈ 3.7–4.7 ms on the phone, over the 2 ms budget**; phone paint
  p50 ≈ 8 + 4 ≈ 12 ms, over the ADR's 10 ms.
- **ALU proxy (lower bound):** the A16's GPU has about half the M3's FP32 throughput → ≈ 2.0–2.2 ms: at or over budget.
- **Ratio proxy:** software GL shows the same relative cost as Chrome (all-on ÷ off = 1.90 vs 1.71–1.80).
- Headless WebKit on the Mac is not a phone proxy: in SP-gpu-color it was slower than the iPhone (33–61 fps vs 128).
- **NFR-03 itself** (≥ 24 fps on the phone = 41.7 ms per frame) is very likely still met: ≈ 12 ms paint p50 leaves a
  wide margin. What fails is ADR-0017's own +2 ms / p50 ≤ 10 ms budget.

### Where the time goes (Chrome, variants)
Mixer +0.51 ms, pop +0.20, split +0.27, duotone +0.10. Each stage pays a full sRGB → linear → OKLab → linear →
sRGB round trip (twelve `pow`/cube roots per pixel) plus CIELAB C* for the grey gate; the mixer adds `atan`,
`sincos` and the gamut search. Halving the gamut loop's matrix work changed nothing measurable, so the cost is the
transcendental-heavy round trips, not the gamut reduction.

## Fidelity (all four tools and three adjustments on; `tests/e2e/colour-tools.spec.ts`)

| Check | Chromium | WebKit | Chrome | Bar |
|---|---|---|---|---|
| GPU paint vs CPU reference, max ΔE00 (hue ring / grey ramp / 24-patch chart) | 0.68 / 0.70 / 0.53 | 0.79 / 0.67 / 0.55 | 0.79 / 0.67 / 0.55 | ≤ 1 (RULE-24 8-bit vs full precision) |
| Export vs preview, 24-patch chart, Balanced 480p | mean 0.90, max 2.15 | mean 0.45, max 1.39 | mean 0.49, max 0.93 | mean < 2, max < 4 (NFR-08) |
| Tools at default vs no tools (hue ring) | identical bytes | identical | identical | ADR §6 bit-identical |

Half-float intermediate in all three. CPU-reference unit tests cover every rendered acceptance criterion of
F-024…F-027 (`tests/unit/compositor.colour-tools.test.ts`).

## Findings
1. **The OK-chroma grey gate of ADR-0017 §2 is wrong below L* 10.** Its claim that every sRGB colour with C* < 2
   has OK C < 0.0065 holds only for L* ≥ 10 (max 0.0061 there). Near black CIELAB is linear and OKLab is not:
   #050003 has C* 1.85 but OK C 0.034, so it got full weight, and a property test found a near-black pixel the
   mixer moved by ΔE00 0.53 (Lightness +100 would move dark sensor noise far more). **Built:** the gate is a
   smoothstep on CIELAB C* from 2 to 12, exactly RULE-24's words, computed from the linear values in the shader
   (one matrix and three cube roots). Its per-step bound is then 1.5 ÷ 10 per C* unit.
2. **Cost over budget by proxy** (above), with and without the fallback. The fallback (one program per set of
   enabled tools, compiled on first use, at most 16) is built and kept: it removes the colour code from the
   no-tools program, so 1.1.0 projects run the 1.1.0 grade, and trims ~0.1 ms.
3. **Split toning tone weights where fades overlap.** At Balance beyond about ±50 the crossover fade (width 30)
   overlaps the black/white fade (width 20); their product changes by up to 0.075 per lightness unit, within
   1.5 ÷ 20 but over 1.5 ÷ 30. RULE-24 bounds each fade, not their product. Tests check each fade against its own
   bound and the product against the narrower one.

## Decision needed (proposed spec changes)
- **A. Budget (ADR-0017 §9).** Recommended: accept with a budget the proxy supports — "+5 ms per 1080p frame on the
  reference phone (paint p50 ≤ 14 ms), NFR-03 unchanged" — and record the phone figure as waived/proxy under QA-5.
  Alternatives: keep 2 ms and wait for an owner run on the iPhone (`pnpm exec playwright test colour-tools
  --project=webkit-realtime --no-deps` serves the same bench), or fund an optimisation spike (e.g. shared
  round trip for mixer+pop+split+duotone around the look via a second look-space table — that changes the
  ADR's structure).
- **B. Grey gate (ADR-0017 §2, RULE-24 *Quality*).** Replace the OK-C gate with "smoothstep on CIELAB C* from 2 to
  12"; change RULE-24's grey-fade bound wording from "per working-space chroma unit" to "per CIELAB C* unit (width
  10)". Already built this way.
- **C. RULE-24 overlapping fades.** Add: "where two fades overlap, each stays within its own bound and their
  product within the narrower fade's bound."

ADR-0017 stays `proposed` until A and B are decided; then its *Outcome (spike)* section can record this report.
