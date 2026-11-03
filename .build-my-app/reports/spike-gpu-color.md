# Spike SP-gpu-color (blocking)

Frame: row 5 of the spike table in `architecture-proposal.md` §5. Decides ADR-0007 (colour, looks)
and the grade/finish passes of ADR-0006, sets the RULE-22 slow-device threshold in
`platform-mapping.md`, and checks ADR-0013 §1's look-data budget. Depends on SP-compositor (one
WebGL2 `paint(plan)` in a worker; frame interval = until the next frame's start; AAC priming via
the edit list; WebKit's decoder needs feeding ahead / flushes) and SP-codec (H.264 + AAC output).

**Question.** Does the full RULE-08 chain plus a look, vignette, deterministic grain and the Blur
background, inside the one WebGL2 `paint`, hold the NFR-03 frame rate, keep enough precision for
RULE-08's grey-ramp bars, and survive the encoder's RGB→YUV conversion within NFR-08?

**Hypothesis.**
- The grade (Temperature/Tint → Brightness/Contrast/Highlights/Shadows → Saturation/Vibrance →
  look (33³ table, intensity) → Fade) fits in one fragment pass into an intermediate texture; the
  finish (Sharpen, Vignette, Grain) and the RULE-07 placement fit in a second pass; Blur
  background is a downsample + separable blur of the graded intermediate. At 1080p this costs
  < 10 ms per frame on a laptop GPU and leaves NFR-03 to decoding.
- A half-float intermediate keeps the ramp bars; an 8-bit intermediate adds double rounding that
  merges or skips ramp steps after Vignette/Sharpen.
- Every curve can be made monotone with slope ≤ 2 on grey, so the RULE-08 ramp bars hold at every
  adjustment's minimum and maximum (in the float reference and on the GPU).
- `new VideoFrame(canvas)` → H.264 encode (Balanced, 6 Mb/s at 1080p30) → decode gives ΔE00
  mean < 2 / max < 4 against the preview on the 24-patch chart, with BT.709 tags, in every engine;
  otherwise the own BT.709 read-back path of ADR-0006 §7 is needed.
- 33³ look tables as 8-bit PNG strips are 50–70 KB each, ≤ 1.2 MB for 16, and 8-bit storage does
  not band.

**Measures.**
1. Playback: painted fps over 30 s of 1080p preview (full chain: every adjustment non-zero, a
   look, sharpen, vignette, grain, Blur background on a portrait clip in a landscape frame, a
   cross-fade, 3 text layers, a music stand-in on the AudioContext clock); plus the GPU cost of the
   chain alone (timed render loop, no decode) at 1080p. Host load average recorded per run.
2. ΔE00 per patch centre on the 24-patch chart clip: preview (read back at 1920×1080) vs decoded
   export, at Balanced quality with Grain 0, for (a) no adjustments, (b) every adjustment non-zero
   + a look, (c) each authored look at 100. Also GPU preview vs the CPU reference.
3. RULE-08 ramp bars on the 256-step grey ramp clip, per adjustment at min and at max: ΔE00 at
   default, reversals, merged non-clipped steps, largest adjacent step vs 2× default — in the CPU
   reference (float and 8-bit), GPU preview (half-float and 8-bit intermediate) and the export.
4. Look data: bytes per look as 33³ 8-bit PNG strip, 16-bit PNG and `.cube`; projected for 16;
   ΔE00 cost of 8-bit storage vs the analytic look.
5. Output colour tags: encoder `decoderConfig.colorSpace`, decoded frame `colorSpace`, MP4/SPS
   tags as read back by mediabunny; and the engine's RGB→YUV matrix checked against our own BT.709
   conversion of the decoded planes.
6. Grain determinism: the same frame painted twice in preview and once in the export path at the
   same size — pixel-identical (preview paths; export compared before encoding).

**Pass criteria.** ≥ 30 fps laptop (≥ 24 fps phones, owner) at 1080p; ΔE00 mean < 2, max < 4 on
the chart in every engine; ramp bars met at every adjustment's min and max; 16 looks ≤ 1.2 MB;
grain pixel-identical; output tagged BT.709. The spike also proposes the RULE-22 slow-device
threshold (measured effects-check fps vs playback fps).

**Time box.** 2 days of agent work.

**Devices / browsers.** Automated: Playwright `chromium`, `chrome` channel (dev only, D-035) and
`webkit` on the MacBook (Apple M3), host shared with other agents (load average recorded). Owner:
Safari 26, Firefox and Chrome on the Mac, iPhone Safari 26 over HTTPS on the LAN (mkcert
certificate as in earlier spikes; the agent never installs CAs; no tunnels). Android deferred
(D-037).

**Not built.** HDR to SDR (SP-hdr); speed and time-stretch; the real audio mixer/worklet (a
looping oscillator stands in for music); photos and 5K sampling; GIF export; look thumbnails and
any UI (sliders, compare, copy/paste); the other 13 looks' final colour (design owns them; only
2–3 sample looks are authored, and their sizes extrapolated); owner sign-off on look intent; rate
control and size targets; OPFS scratch; the sandboxed frame.

---

## Results (2026-11-03, automated part; branch `spike/gpu-color`)

Status: **automated part done** in Playwright `chromium` 156.0.8078.4 (its WebGL is **SwiftShader,
software**), `chrome` 156.0.8078.80 (ANGLE Metal, Apple M3) and `webkit` 27.2 (Apple GPU), headless,
on the MacBook (Apple M3, 8 cores). Safari 26, Firefox, real Chrome and the iPhone are waiting on the
owner (`spikes/gpu-color/README.md`). Time used: about 0.4 d of the 2 d box.

Prototype: `spikes/gpu-color/` (≈ 1,300 lines incl. harness; `lib/plan.js`, `lib/decoder.js` and
`lib/mux.js` come from SP-compositor). Raw data: `spikes/gpu-color/results/*.json`. To print it, run
`node summarize.mjs` and `node tools/extra-stats.mjs`.

**Caveat on timings:** other agents' spikes shared the Mac the whole time. Load average was
**18–52 on 8 cores**, recorded per run in `playwright.loadavg*`. Colour results don't depend on load.
The fps and ms figures are pessimistic.

### Against the pass criteria

| Criterion | chromium (SwiftShader) | chrome | webkit | Verdict |
|---|---|---|---|---|
| 1080p playback, 30 s, full chain (12 adjustments non-zero, look at 80, sharpen 40, vignette 40, grain 30, Blur background, cross-fade, 3 texts, oscillator music on the AudioContext clock) | 4.2 fps | **30.0 / 29.8 fps** (2 runs); paint+sync p50 6.3–6.7 ms, p95 10.5–12.7 ms | **29.7 / 28.8 fps**; p50 10–11 ms, p95 27 ms | **pass** on the GPU engines: the laptop target of 30 fps is met within 1 fps under load 40+. Software GL fails, as it should. |
| Chain cost alone (effects check: 1080p, Blur, 60 frames, ImageBitmap upload each frame) | 2.4 fps (421 ms) | 486–553 fps (1.8–2.1 ms); minimal chain 632–713 fps | 33–61 fps (16–30 ms); minimal chain 52–69 fps — upload and sync dominate, not the grade | On the M3 the grade itself adds < 1 ms. |
| Chart ΔE00, preview vs decoded export (H.264 6 Mb/s, Grain 0); worst of 6 configs (identity, all adjustments + look, 3 looks, video source) | mean ≤ 0.73, max 1.83 | mean ≤ 0.35, max 1.07 | mean ≤ 0.40, max 1.94 | **pass** everywhere (limit: mean < 2, max < 4). No own BT.709 read-back path is needed. |
| GPU vs CPU reference (chart, max ΔE00) | ≤ 0.74 | ≤ 0.53 | ≤ 0.53 | **pass**. On the ramp, the GPU half-float layer is within 0.10 of the CPU (grain excluded). |
| RULE-08 ramp bars at every adjustment's min and max, in the CPU reference (float) and on the GPU **half-float layer** read back as float | all pass (Vignette and Grain excepted, see finding 4) | all pass | all pass | **pass** in high precision |
| The same bars on the **8-bit** preview output | Distinctness fails for every compressive setting: merged steps are 49 at Brightness ±100, 128 at Contrast −100, 64 at Fade 100, 30–34 at Highlights/Shadows ±100, 36 at Contrast +100, and 16 for the B&W look. The max-step bar fails for colour-shifting settings: Temperature/Tint ±100 and the colour looks give 0.97–1.87 against a bound of 0.80. | same | same | **fails because of 8-bit arithmetic, not precision** (finding 1) |
| The same bars on the export | Chrome writes limited range, so 36 steps merge even at default. Colour-shifted ramps get 1–5 tiny reversals (worst ΔL* −0.27) and steps up to ΔE00 5.0 from chroma quantisation. | | | findings 1–3 |
| Half-float vs 8-bit intermediate | Merge counts on the 8-bit output are the same, except Grain and "all" (11 vs 10; 6 with recompute-taps). Chart u8 vs f16: max ΔE00 0.76. | same | same | f16 is only better before the 8-bit target, and u8 is an acceptable fallback. Recompute-taps isn't needed, because half-float is renderable in every engine. |
| Grain pixel-identical (preview twice + export path, same size and frame) | identical; changes with each frame | identical | identical | **pass** |
| 16 looks ≤ 1.2 MB | 3 authored looks as 33³ 8-bit PNG strips: **3.7 KB (B&W), 10.1 KB (Warm), 15.1 KB (Teal & Orange)**, so 16 looks ≈ 60–242 KB (mean 154 KB). As 16-bit PNG: 13–116 KB each (≤ 1.85 MB for 16). As `.cube`: 970 KB each. Raw 8-bit: 108 KB each, 1.72 MB for 16 (the incompressible bound). | | | **pass** with a wide margin for smooth tables. 8-bit storage error vs the float table: ΔE00 mean 0.08, max 0.78. No banding seen in the ramps. |
| Output tagged BT.709 | primaries **bt709**, matrix **bt709**, transfer **iec61966-2-1 (sRGB, code 13)**, **full range** | bt709 / bt709 / sRGB / **limited** | bt709 / bt709 / sRGB / **full range** | **partial** (finding 2) |

### What surprised us

1. **On any 8-bit output, two RULE-08 bars can't hold: "steps stay distinct" and "no step above 2× the default's largest".**
   - Any setting with a slope below 1 maps the 256 inputs onto fewer than 256 codes. That covers darkening, Contrast −, Fade, Highlights/Shadows and the B&W look's shoulder. The merges are arithmetic, not a precision bug.
   - Colour-shifting settings (Temperature, Tint, colour looks) turn a 1-code step in one channel into a chroma step of ΔE00 1.0–1.9 near black. That is above the 0.80 bound.
   - The same chain passes every bar in float, both in the CPU reference **and on the GPU's half-float layer**, in all three engines.
   - → Spec change: evaluate RULE-08's ramp bars on the high-precision render (CPU reference + the compositor's half-float layer), with Grain 0. On 8-bit outputs (preview and export), require only two things: no reversal larger than ΔL* 0.5, and every step within ΔE00 1 of the reference.
2. **Encoders differ in range, and every engine tags the transfer as sRGB.**
   - Chrome's hardware H.264 writes limited range with the BT.709 matrix.
   - WebKit and Playwright chromium (openh264) write **full range**.
   - All three tag transfer 13 (sRGB), not BT.709 (1).
   - The matrix is right: where range is limited, our own BT.709 conversion of the decoded planes matches the engine's within ΔE00 0.12–0.24. BT.601 would be 2.2–2.7 off on average.
   - Risks:
     - Players that ignore the full-range flag show crushed shadows and clipped highlights.
     - QuickTime and Photos may treat transfer 13 differently from transfer 1.
   - → ADR-0007/ADR-0010: MOD-Export writes the `colr` box explicitly:
     - primaries 1 and matrix 1;
     - the transfer decided by the owner's player check;
     - the range that the encoder produced.
   - → ADR-0016: add a player check.
   - If full range breaks a target player, convert to limited range ourselves on WebKit (the ADR-0006 §7 read-back path).
3. **Limited range costs 36 of the 256 grey levels.** Chrome's export at default settings has 36 merged steps. This is inherent to 8-bit limited-range video, so no export can meet the 8-bit ramp bars. Finding 1's amendment covers it.
4. **Vignette and Grain can't be judged on a spatial ramp.**
   - At Vignette 100, 88–92 patches "reverse", because the ramp spans the frame. Checked per pixel position (centre, edge, corner), Vignette passes in float.
   - Grain is noise by definition.
   - → RULE-08 bars: check Vignette per position and run at Grain 0, as NFR-08 already does.
5. **Video sources add their own loss before the grade.**
   - The chart encoded as an H.264 source differs from its nominal values by ΔE00 0.21–0.37 on average (max 0.69).
   - A limited-range ramp source loses 36 levels.
   - → Grade fidelity fixtures should be RGB stills (the photo-clip path).
6. **The chain is cheap; upload and sync dominate.**
   - On the M3, the full grade + look + Blur adds about 0.5 ms at 1080p.
   - WebKit's effects check takes 15–30 ms per frame, mostly in `texImage2D(ImageBitmap)` and the read-back sync.
   - The 3D LUT, half-float FBOs and the integer grain hash work in all engines.
7. **Looks are far smaller than ADR-0007 estimated**: 4–15 KB, not 50–70 KB, because smooth tables compress well. Hand-made tables with noise will be larger. The hard bound is 108 KB each.

### Slow-device threshold (RULE-22): proposal

Measured pairs (effects-check fps → playback fps at the same output size):

| Engine | Output size | Effects check | Playback |
|---|---|---|---|
| chrome | 1080p | 486–553 fps | 30 fps |
| chrome | 2160p | 39–59 fps | 30 fps |
| webkit | 1080p | 33–61 fps | 28.8–29.7 fps |
| webkit | 2160p | 13–17 fps | **21.4 fps** |
| SwiftShader (chromium) | 1080p | 2.4 fps | **4.2 fps** |

**Proposal:**
- At start-up, run the effects check: the full RULE-08 chain + a look + Blur at 1080p, on a generated bitmap. Use 5 warm-up frames and 30 timed frames, with one GPU sync at the end. This takes about 0.1–1 s.
- If it renders **below 30 fps (more than 33 ms per frame)**, show COPY-notice.slow_device.
- Why 30: playback held ≥ 24 fps whenever the check gave ≥ 33 fps, and fell below 24 when the check gave 13–17 fps. The check doesn't include decoding, so 30 keeps a margin for it.
- This replaces "< 24 fps equivalent" in `platform-mapping.md`.
- The iPhone run (owner) should confirm it.

### Recommendation (provisional): **adopt ADR-0006/ADR-0007's colour design, with amendments**

The one WebGL2 paint carries the full RULE-08 chain, a 33³ look, vignette, deterministic grain and
the Blur background at 30 fps on laptop GPUs. Preview vs export stays within ΔE00 0.73 (mean) and
1.94 (max), and the ramp bars are met at float precision.

Amendments:
- **RULE-08 / F-007.AC2 (spec change, owner):** findings 1 and 4.
  - Check the bars on the high-precision render, at Grain 0, with Vignette checked per position.
  - Check 8-bit outputs for reversals larger than ΔL* 0.5 and for ΔE00 ≤ 1 against the reference.
- **ADR-0006 §3.2:**
  - Use the half-float intermediate where it is renderable (all three engines).
  - Use the 8-bit intermediate as the fallback; it measured the same on 8-bit output.
  - Drop the recompute-taps variant.
- **ADR-0007 §3 / ADR-0013:**
  - Keep 33³ 8-bit PNG strips.
  - Budget 30 KB per look (16 looks ≈ 0.5 MB).
  - The build fails a look over 108 KB, or one whose storage error is above ΔE00 1.
- **ADR-0007 §1, ADR-0010:**
  - Write the `colr` tags explicitly.
  - Decide the transfer tag and full vs limited range from the owner's player check.
  - On engines whose full-range output breaks a target player, do our own limited-range conversion.
- **platform-mapping.md:** the slow-device threshold above.
- **ADR-0016:**
  - Grade fidelity fixtures are RGB stills.
  - The chart and ramp oracle compares against the CPU reference in float.
- Still unproven: **≥ 24 fps on the iPhone**, and Safari 26 and Firefox (owner runs).

### Owner must run

Run Safari 26, Firefox and Chrome on the Mac, then the iPhone, with `npm run serve` (https, port 8445). Reuse the existing mkcert CA. The agent never installs CAs and uses no tunnels.

1. Press Run, wait for `done`, and download the JSON.
2. Do the 5-minute player check (README step 6): open the downloaded chart MP4 in QuickTime, Photos and VLC/IINA next to the preview.

Ideally run with no other heavy jobs on the Mac.
