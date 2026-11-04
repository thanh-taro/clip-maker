# Spike SP-speed

Frame: row 9 of the spike table in `architecture-proposal.md` §5. Checks NFR-04 against the
architecture as amended by the earlier spikes: ADR-0003 (threads), ADR-0004 §5 (encode settings),
ADR-0006 (one WebGL2 `paint`), ADR-0007 (grade + look), ADR-0008 (own mixer + limiter, with the
SP-audio verify-and-trim pass) and ADR-0010 (export pipeline). Depends on SP-compositor (paint,
export path, AAC priming through the edit list), SP-gpu-color (full grade chain, half-float
intermediate, Blur background) and SP-audio (mixer, limiter at −1.5 dBTP, verify-and-trim).

**Question.** Does a 1080p30 export of the NFR-04 fixture, through the real pipeline, finish within
75 s on the reference laptop and 150 s on the reference phone, set-up included? If not, where does
the time go and what fixes it?

**Hypothesis.**
- The video path is bound by the hardware H.264 encoder, not by decoding or painting. SP-compositor
  measured 6.85× real time in Chrome and 2.82× in WebKit for a plain 1080p export (no grade, no
  look). Adding the grade chain, a look, the Blur background and a 9:16 frame costs < 5 ms per
  frame on the laptop GPU, so the fixture exports at ≥ 3× real time in Chrome and ≥ 1.5× in WebKit
  (≤ 20 s / ≤ 40 s).
- The audio pass (decode 3 clip sounds + music, mix, limiter, AAC encode, decode-and-measure,
  usually one trim re-encode) costs a few seconds of CPU. It can run alongside the video in a
  second worker, so it adds almost nothing to the wall time.
- `new VideoFrame(canvas)` is cheaper than a `readPixels` read-back. An encoder queue of 2–8
  frames is enough to keep the encoder busy.

**Measures.**
1. Wall time from "Export" to the finished MP4 bytes, set-up included, median of 3 runs per
   engine. Real time factor = 60 s ÷ wall time.
2. Breakdown per run (ms): set-up (open sources, compositor, looks, text, encoder configure);
   video decode wait; paint (command submission); frame wrap (`new VideoFrame`); encoder
   back-pressure wait; mux (packet adds + finalize); audio pass (source sound decode, mix +
   limiter, AAC encode, verify decode + true-peak meter, trim re-encodes). Max and mean encoder
   queue depth.
3. Profile variants: frame source (`VideoFrame(canvas)` vs `readPixels` → `VideoFrame(buffer)` vs
   `transferToImageBitmap`); encoder queue cap (2 / 4 / 8 / 16); `hardwareAcceleration`
   (no-preference / prefer-hardware / prefer-software); `latencyMode` (quality / realtime); audio
   serial vs in a parallel worker; decode-ahead (prefetch on/off).
4. Host load average (1-min) at the start, during and at the end of each run: other agents share
   the machine.
5. Output check: frame count, duration, codec strings, file size; audio decoded true peak after
   the trim; the MP4 opens in mediabunny with both tracks.

**Fixture (NFR-04).** 60 s, 9:16 output at 1080×1920, 30 fps, Balanced quality (H.264 High,
6 Mb/s, keyframe every 2 s, AAC-LC 128 kb/s 48 kHz stereo). Three generated phone-like clips with
sound (H.264 High 1080p30 at ~16 Mb/s, 1 s GOP, AAC 48 kHz stereo):
(A) Android-style native portrait 1080×1920; (B) iPhone-style 1920×1080 coded with a 90° rotation
tag; (C) a landscape 1920×1080 clip fitted into the 9:16 frame with the Blur background. Clips of
21 s, 21 s and 20 s joined by two 1 s cross-fades (= 60 s). A title (0–3 s, fades). The look
"cine-teal-orange" at 80 % plus 6 non-zero adjustments (temperature, contrast, shadows, saturation,
vibrance, vignette) on every clip. Music (generated, looped) at 60 % over the whole 60 s with
fade-in/out, mixed with the clip sound (cross-faded with the clips), limited at −1.5 dBTP,
verify-and-trim to −1.3 dBTP decoded.

**Pass criteria.** Laptop: median ≤ 75 s (≥ 0.8× real time incl. set-up; NFR-04 asks ≥ 1×, i.e.
≤ 60 s of pure export). Phone: median ≤ 150 s (owner run). If missed, a profile that names the
bottleneck and at least one measured fix.

**Time box.** 1 day of agent work.

**Devices / browsers.** Automated: Playwright `chrome` channel (dev only) and `webkit` on the
MacBook (Apple M3, 8 cores, 16 GB), headless, host shared with other agents (load average recorded).
Playwright `chromium` uses SwiftShader software GL and the software encoder: run for completeness,
not judged. Owner: Safari 26, Firefox and Chrome on the Mac; iPhone Safari 26 over HTTPS on the LAN
(mkcert as before; the agent never installs CAs; no tunnels). Android deferred (D-037).

**Not built.** HDR sources (SP-hdr); HEVC sources (generated fixtures are H.264; the owner's real
phone clips can be dropped in later); 44.1 kHz sources and resampling; speed changes and
time-stretch (SP-timestretch); OPFS scratch and streaming mux (SP-storage — the MP4 is held in
memory, `fastStart: 'in-memory'`); rate control and size targets (SP-size-target); GIF and
audio-only export; cancel; the sandboxed frame; any UI beyond a Run button.

---

## Results (2026-11-04, automated part; branch `spike/speed`)

Status: **automated part done** (Playwright `chrome` channel 156 and `webkit` 27.2, headless, MacBook
Apple M3, 8 cores). Safari 26, Firefox, Chrome by hand and the iPhone are owner runs (`spikes/speed/README.md`).
Time used: about 0.7 d of the 1 d box (excluding two interruptions of the host).

**Host load was extreme**: the 1-min load average was 35–200 on 8 cores during every run (other agents),
recorded every 5 s in each JSON. All numbers below are therefore pessimistic and noisy (the same variant
varies ±30 % between runs); differences under ~20 % are not meaningful.

Prototype: `spikes/speed/`. Raw data: `spikes/speed/results/speed-pw-*.json` (+ page screenshot and four
decoded export frames each). `node summarize.mjs` prints the tables.

### Against the pass criteria

| Criterion | Result | Verdict |
|---|---|---|
| Laptop ≤ 75 s incl. set-up, median of 3 | **Chrome: 20.0 s** median (21.9 / 20.0 / 18.6 s; load 56–101) = **3.0× real time**. All 9 Chrome base runs over three batches: 18.6–27.2 s, median 21.9 s. **WebKit: 44.1 s** median (81.3 / 36.5 / 44.1 s; load 130–190) = 1.36×; one run of three over 75 s at load ≈ 170 | **pass** in Chrome with 3–4× margin; **provisional pass** in WebKit (needs an owner run on a quiet host) |
| Same, quieter batch (`-quiet`, load 22–85) | **Chrome 16.3 s** median (19.5 / 16.3 / 15.5) = **3.68×**; hybrid 16.8 / 15.4 / 13.8 s. **WebKit 37.3 s** median (40.0 / 37.3 / 31.4) = **1.61×**; hybrid 36.4 / 58.6 / 41.0 s; all 6 WebKit runs ≤ 58.6 s | **pass** in both engines |
| NFR-04 "≥ 1× real time" (60 s fixture ≤ 60 s) | Chrome 2.2–4.9× in every run except prefer-software; WebKit 0.74–1.65× in base runs | pass (Chrome), provisional (WebKit) |
| Phone ≤ 150 s | not measured (owner) | open |
| Output correct | Every run: 1800 frames, 1080×1920, 60.03 s, H.264 High + AAC-LC 48 kHz stereo, audio starts at −44 ms (edit list), ~46 MB at 6 Mb/s; decoded frames show title, look, Blur background, rotation and cross-fades (`results/*-frame*.png`) | pass |

### Where the time goes (ms; Chrome = the median base run, WebKit = the median base run)

| Stage | Chrome base (20.0 s) | Chrome `serial` best (13.8 s) | WebKit base (44.1 s) |
|---|---|---|---|
| Set-up (open 3 sources, compositor, look, title, encoder) | 224 | 98 | 144 |
| Video decode wait | 8 466 | 2 091 | 20 198 |
| Paint (command submission) | 2 061 | 793 | 8 075 |
| Frame wrap `new VideoFrame(canvas)` | 444 | 190 | **14 300** (≈ 8 ms/frame) |
| Encoder back-pressure wait (queue cap 4; mean depth) | 2 969 (3.4) | 7 032 (4.0) | 2 (0.0 — never full) |
| Encoder flush + mux (interleave + finalize) | 30 + 106 | 32 + 48 | 12 + 76 |
| Waiting for the audio pass at the end | **5 310** | 0 (ran first: 3 424) | 0 |
| Audio pass (own worker): decode / mix+limiter / AAC / verify ×3 / re-encode ×2 | 7 480 / 2 990 / 2 333 / 5 075 / 1 690 = **19.6 s** | 448 / 886 / 289 / 1 261 / 540 = 3.4 s | 5 892 / 1 482 / 6 521 / 14 771 / 9 917 = **38.6 s** |

- `sync` variant (1-px `readPixels` after each paint) attributes the GPU work: **7.8 s = 4.4 ms/frame** in
  Chrome for the full chain at 1080×1920 (grade + look + Blur + finish + mix + title, half-float), under
  load. Without the sync this time hides inside the encoder wait. WebKit: 6.5 s (3.6 ms/frame).
- **Bottleneck, Chrome:** when the audio pass runs in a parallel worker, *it* is the critical path. Its
  source-sound decode takes **7–12.6 s in parallel vs 0.45–2.8 s alone**, and the video decode wait grows
  from 2–7 s to 8–14 s: decoding the clips' sound (mediabunny reading the interleaved 16 Mb/s files
  through `BlobSource` + `AudioDecoder`) competes with the video decoders. The video alone is
  encoder-bound (queue full, 3–7 s of back-pressure).
- **Bottleneck, WebKit:** CPU work per frame, not the encoder (its queue never fills): `VideoFrame(canvas)`
  costs ≈ 8 ms per frame (a copy), decoding has **15 `flush()` + restarts per decoder slot** (the
  SP-compositor finding: WebKit holds frames back; each restart re-decodes up to a 1 s GOP), and paint
  submission is 3–4× Chrome's. All three scale with host load.

### Profile variants (one run each unless noted; Chrome load 56–200, WebKit 115–190)

| Variant | Chrome wall (s) | WebKit wall (s) | Finding |
|---|---|---|---|
| base (audio worker in parallel) | 20.0 median (18.6–27.2, n = 9) | 44.1 median (36.5–81.3) | — |
| `serial` (audio pass first, same worker) | 13.8–27.4, median ≈ 24 (n = 7) | 110.9 | no better in Chrome; much worse in WebKit (its audio pass is slow) |
| **`hybrid`** (audio worker decodes sound first, video waits ≤ 1–5 s, then mix/encode/verify alongside the video) | **17.8 median** (15.6 / 17.8 / 27.9) vs base 23.4 and serial 26.4 in the same interleaved batch | 59.2 / 72.2 (load 130–150) | **best in Chrome** under heavy load: removes the decode contention. Quieter batch: hybrid 15.4 s vs base 16.3 s (−6 %, within noise). WebKit quiet: 41.0 vs 37.3 s — no gain, the video is its critical path |
| `readback` (`readPixels` → `VideoFrame(buffer)`) | 25.9 (wrap 20.5 s = 11 ms/frame) | 71.2 (wrap 37 s) | **reject**: 2× slower than `VideoFrame(canvas)` |
| `bitmap` (`transferToImageBitmap` → `VideoFrame`) | **fails**: `OperationError: Failed to create video frame` | not run | reject |
| queue cap 2 / 8 / 16 | 18.3 / 15.7 / 16.6 | — / 65.3 / — | cap 4–8 is enough; no deep queue needed |
| `hardwareAcceleration: 'prefer-hardware'` | 18.1 | — | same as the default (Chrome already picks hardware) |
| `hardwareAcceleration: 'prefer-software'` | **74.7 = 0.80×** (encoder wait 69 s) | 67.1 (ignored by WebKit) | **software H.264 at 1080×1920 ≈ 25 fps: misses NFR-04 by itself** |
| `latencyMode: 'realtime'` | 30.6 (decode wait spiked with load) | 41.7 | no gain shown; keep `quality` |
| `prefetch` (decode-ahead after paint) | 20.6 | 50.2 | no gain; the decoder already runs ahead within `frameAt` |
| Playwright `chromium` (SwiftShader GL + software encoder) | **882 s = 0.07×**; 854 s of it in `VideoFrame(canvas)` (≈ 475 ms/frame read-back from SwiftShader) | — | not judged (software GL; recorded only) |

### What surprised us
1. **The audio pass, not the picture, set the Chrome export time under heavy load** — through decoder
   contention, not CPU (sound decode 7–12.6 s in parallel vs ≤ 2.8 s alone; 0.7–3 s on the quieter host).
   The verify-and-trim loop is 40–70 % of the audio pass in every engine.
2. **Verify-and-trim needed all 3 passes on this fixture in both engines and did not land where aimed.**
   Chrome: −0.38 → (trim −1.12 dB) −0.70 → (−1.92 dB) **−2.58 dBTP** (1.3 dB quieter than needed).
   WebKit: +0.21 → −1.12 → **−1.18 dBTP** (stops above the −1.3 aim, still ≤ −1). The decoded peak does
   not move 1:1 with the gain (AAC peaks are not linear in level at this density). → SP-audio amendment.
3. **Software H.264 alone is ≈ 0.8× at 1080p on the M3** (under load). ADR-0004 §5's "retry with
   `prefer-software` on failure" keeps exports working but not at NFR-04 speed.
4. **WebKit's `VideoFrame(canvas)` is a ≈ 8 ms copy**, a third of its per-frame budget; Chrome's is 0.25 ms.
5. `transferToImageBitmap` from the WebGL `OffscreenCanvas` cannot be wrapped as a `VideoFrame` in Chrome.

### Recommendation (provisional): **adopt** ADR-0010's export pipeline and ADR-0006's `VideoFrame(canvas)` path, **with amendments**

The real pipeline meets NFR-04 on the laptop in Chrome with a 3–4× margin even on a host loaded 7–25×
over its core count; WebKit meets it on the median but not with margin under that load. Phones are open.

Implied changes (queued for `spike-amendments.md`):
- **ADR-0010 / MOD-Export / MOD-Audio — schedule the audio pass:** decode the clips' sound *before*
  the video loop starts (or in the same demux read), then run mix + limiter + AAC + verify in the audio
  worker *concurrently* with the video. Avoid decoding source sound concurrently with the video decoders.
  Measured in Chrome: 17.8 s vs 23.4 s (parallel) vs 26.4 s (serial) under heavy load; 15.4 vs 16.3 s on
  the quieter host. Never run the audio pass serially before the video (WebKit: 111 s).
- **ADR-0008 / SP-audio amendment — trim step:** aim the trim at −1.5 dBTP decoded with the measured
  gain→peak slope from pass 1→2 (secant step), cap at 3 passes, and accept ≤ −1.0 dBTP as the stop rule
  (NFR text) rather than −1.3; this would have saved one pass (≈ 2–7 s) and 1.3 dB of loudness in Chrome.
- **ADR-0004 §5:** keep `hardwareAcceleration: 'no-preference'`, `latencyMode: 'quality'`; encoder queue
  cap 4–8. Record in the capability probe whether the H.264 encoder is hardware; when only software
  encode is available, the export estimate (F-015) must say so (≈ 0.8× at 1080p on the laptop, worse on
  phones) — NFR-04 cannot hold there. Consider 720p as the RULE-22 slow-device default for exports.
- **ADR-0006 §7:** `readPixels` read-back costs 2× export time; keep it only as the colour fallback.
  Don't use `transferToImageBitmap`.
- **MOD-Codec (WebKit):** feed further ahead to avoid the 15 flushes per decoder per minute (SP-compositor
  already says so); measure on the iPhone.
- **ADR-0016 / QA:** NFR-04 timings must be taken on a quiet host with the load average recorded; this
  spike's numbers are upper bounds.
- **Memory note for SP-storage / SP-mem-phone:** the spike keeps encoded video (46 MB) and the MP4 in
  memory; the streaming OPFS writer must interleave audio that arrives *after* the video (hybrid
  schedule) — e.g. write audio first from the finished audio pass, or a fragmented layout.

### Owner steps
Run `https://localhost:8446/?runs=base,base,base,serial,hybrid` in Safari 26, Firefox and Chrome on the
Mac (quiet host), and `https://<LAN-IP>:8446/?runs=base,base,base,hybrid` on the iPhone; details in
`spikes/speed/README.md`. Pass: median ≤ 75 s (Mac), ≤ 150 s (iPhone). Firefox is unmeasured so far.

## Owner device results: iPhone 14 Pro, iOS Safari 27.0.1 (2026-11-04)
- **NFR-04 fixture** (60 s, 9:16, 1080×1920): **median 34.4 s (1.74× real time)**, against a target of ≤ 150 s and ≥ 0.5×. Passes with a large margin.
- All 4 runs (3 base, 1 hybrid) produced 1800 frames with no errors.
- **Where the time goes:**
  - Wrapping the canvas as a `VideoFrame` takes 21.7 s of the 34 s, the biggest cost.
  - Waiting on the decoder takes 11 s.
  - The audio worker takes 5.1 s.
- **Verify-and-trim** needed 3 passes and ended at −1.18 dBTP decoded. It meets the −1 dBTP NFR, but the secant-step amendment still applies.

**Verdict: adopt.**
