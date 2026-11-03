# Spike SP-compositor (blocking)

Frame: row 4 of the spike table in `architecture-proposal.md` §5. Decides ADR-0006 (one WebGL2
`paint`), and informs ADR-0003 (worker topology), ADR-0009 (seek, bounded caches) and ADR-0010
(export pipeline). Depends on SP-codec (output MP4 · H.264 + AAC; AAC description normalised to the
2-byte AudioSpecificConfig; encode concurrency ≤ 4) and SP-license (mediabunny 1.65.0 approved, D-042).

**Question.** Can one `paint(plan)` in a worker drive both the preview and the export, stay in sync
with the audio clock, and seek fast enough?

**Hypothesis.**
- A pure `planAt(project, t)` (MOD-Plan) plus one WebGL2 `paint(gl, plan, textures)` on an
  `OffscreenCanvas` (MOD-Compositor) produces the same picture for the preview path (rendered at
  export size) and for the decoded export: same source frame (±1 project frame), same placement
  (±2 px), for cross-fades, fit/fill/scale/rotate/flip placement and a text bitmap.
- Export timestamps taken from the frame-time convention (frame *k* starts at
  floor(*k* × 1,000,000 ÷ rate) µs) and audio rendered from the same plan keep the picture and the
  sound within 40 ms over a 10-minute export, with no growing drift.
- Two own `VideoDecoder`s fed by mediabunny's demuxer, with a keyframe seek and a bounded frame
  cache, answer a seek within 150 ms (p95) on phone-like GOPs (1 s); long-GOP sources are slower,
  and coarse-then-exact (paint the keyframe first) keeps the first visible response fast.

**Measures.**
1. Frame diff: every frame of a ~25 s test project, preview path rendered at 1920 × 1080 vs the
   decoded export frame: best-matching preview frame offset (frames) and best spatial shift (px),
   plus PSNR at zero offset.
2. A/V clap offset: sources carry a full-frame white flash on the frame where a beep starts; across
   a 10-minute export (or 2–3 min, extrapolated, if too slow — and then said so), offset = beep
   onset in the decoded export audio − start time of the flash frame in the decoded export video;
   max |offset| and the drift slope.
3. Seek latency: scripted random seeks and a scripted drag-scrub, page → engine → painted,
   p50/p95/max per source GOP class; coarse (first paint) and exact. Long-GOP worst case recorded.
4. Side measures: preview playback pacing against the AudioContext clock (painted fps, late
   frames), export wall time (× real time), and whether WebGL2 + `texImage2D(VideoFrame)` +
   `new VideoFrame(OffscreenCanvas)` work in each engine.

**Pass criteria.** Every export frame within 1 frame and 2 px of the preview; A/V offset within
40 ms everywhere across 10 min with no drift; seek p95 ≤ 150 ms on 1 s-GOP sources (long-GOP
worst case recorded, not pass/fail).

**Time box.** 3 days of agent work.

**Devices / browsers.** Automated: Playwright `chromium`, `chrome` channel (dev only, D-035) and
`webkit` on the MacBook. Owner: Safari 26 and Chrome on the Mac, iPhone Safari 26 over HTTPS on the
LAN (mkcert certificate as in SP-codec; the agent never installs CAs; no tunnels). Android deferred
(D-037).

**Not built.** Colour grading, looks, vignette, grain, sharpen and the Blur background
(SP-gpu-color); speed and time-stretch (SP-timestretch); the real audio mixer, worklet and limiter
(SP-audio — this spike uses a simple plan-driven mix played through `AudioBufferSourceNode`s);
HDR (SP-hdr); phone memory limits (SP-mem-phone); rate control and size targets (SP-size-target);
OPFS scratch (SP-storage — the export is held in memory); the sandboxed frame (SP-frame); photos,
GIF export, timeline thumbnails and any app UI; real phone-recorded fixtures (generated stand-ins:
WebCodecs-encoded H.264 with 1 s and 10 s GOPs).

---

## Results (2026-11-03, automated part; branch `spike/compositor`)

Status: **automated part done** in Playwright `chromium` 156.0.8078.4, `chrome` 156.0.8078.80
(headless) and `webkit` 27.2 on the MacBook (Apple silicon). Safari 26, real Chrome and the
iPhone are waiting on the owner (`spikes/compositor/README.md`). Time used: about 0.5 d of the 3 d box.

Prototype: `spikes/compositor/` (≈ 1,400 lines incl. harness). Raw data: `spikes/compositor/results/*.json`.
Run `node spikes/compositor/summarize.mjs` to print a summary.
Pieces:
- `lib/plan.js`: pure `planAt(project, t)`, frame times and the audio mix.
- `lib/compositor.js`: one WebGL2 `paint(plan, frames, texts)`.
- `lib/decoder.js`: own `VideoDecoder` pool of 2, fed by mediabunny's `EncodedPacketSink`, with a bounded cache of 8 frames.
- `engine-worker.js`, `export-worker.js`, `verify-worker.js`.
- `fixtures-worker.js`: makes the test sources with WebCodecs and mediabunny.

**Caveat on timings:** other agents' spikes ran browsers on the same Mac the whole time. Load
average was 27–90 on 10 cores; `loadavg` is recorded in each `*-seekN.json`. Fidelity and A/V
results do not depend on speed. Seek, playback and export-speed numbers are pessimistic and noisy.
One early run at lower load is quoted where it matters.

### Against the pass criteria

| Criterion | chromium | chrome | webkit | Verdict |
|---|---|---|---|---|
| Every export frame within 1 frame of the preview (720 frames, preview path at 1920×1080 vs decoded export) | 720/720 at offset 0 | 720/720 at 0 | 720/720 at 0 | **pass** |
| … and within 2 px | 0 px (frames with mean luma ≥ 16) | 0 px | 0 px | **pass**. On the 16 near-black fade frames the shift search is meaningless (up to 3 px, MAD < 1). |
| PSNR, luma, zero offset (min / median) | 31.9 / 49.6 dB | 41.6 / 53.2 dB | 41.9 / 51.6 dB | info: encoder loss only |
| Export frame timestamps = floor(k·10⁶/30) µs | 0 mismatches | 0 | 0 | pass |
| A/V clap offset across a **10-min** export (257 claps; full 10 min, not extrapolated) | +0.04…+0.06 ms, drift 0 ms/min | same | +0.04 ms, drift 0 | **pass** (limit 40 ms) |
| Seek p95 ≤ 150 ms, 1 s-GOP sources, random seeks (3–4 runs under load) | 128–203 ms (36.8 ms in an earlier run at lower load) | 23–53 ms | 63–174 ms | **pass** on chrome; **load-dependent** on chromium (software decode) and webkit; needs owner hardware runs |
| Long-GOP (10 s) worst case: seek to 0.2 s before the next keyframe, exact frame (p50 / p95 range over runs) | p50 265–1860, p95 479–2389 ms (p50 158 ms at lower load) | p50 133–209, p95 137–260 ms | p50 348–501, p95 369–783 ms | recorded. Coarse first paint p50: 21–57 ms (chromium), 11–25 ms (chrome), 22–57 ms (webkit) |
| 1 s-GOP worst case (last frame of a GOP), p50 | 70–198 ms | 28–54 ms | 54–153 ms | info |
| Playback against the AudioContext clock, 8 s including a cross-fade | 69–234 of 240 frames painted (load-bound software decode) | 235–238/240 | 226–232/240 | info for NFR-03 (owner hardware runs) |

### What surprised us (findings that change specs or ADRs)

1. **AAC priming shifts sound by 44 ms per encode, and it adds up.**
   - Neither engine's AAC `AudioEncoder` nor the writer removes the 2112-sample encoder delay. Our own generated source was decoded 44.04 ms late. The first export was **88.05 ms late**: source and export priming added together. That breaks NFR-08's 40 ms budget after a single encode.
   - Fix used: shift the AAC packet times by −2112/48000 s. mediabunny then writes an MP4 edit list (`firstAudioTs` −0.044 s), and every engine's reader honours it.
   - Result after the fix: +0.04 ms on the source and +0.04 ms on the export, with zero drift over 10 minutes in all three engines. This is sample rounding (2 of 48 000).
   - The writer must also *honour* edit lists on input. Phone MP4s carry them, and mediabunny's sinks apply them.
   - → ADR-0010 / MOD-Export: "remove the encoder delay (AAC 2112 samples; Opus pre-skip) through the container's edit list". ADR-0004's trial encode should measure the delay instead of assuming 2112 (an impulse round trip). This joins the SP-codec description fix.
2. **µs rounding picks the wrong source frame.**
   - The first diff run had **389 of 720 frames off by −1**, in a 0/−1/−1 pattern.
   - Cause: chunk durations are rounded to whole µs (33 334). A frame "covering" `ts + duration` then also claimed the next frame's start (33 333). The just-in-time export decoder showed the previous frame whenever the next one was not decoded yet.
   - Fix: a frame's display interval is [ts, next frame's ts). The duration is only trusted when the next frame is unknown, and then only up to 2 µs before its end.
   - → rules.md "Source frames" is right; MOD-Engine/MOD-Codec should state the half-open interval and the tolerance, plus a property test across 24/25/30/60 fps sources and projects.
3. **Ties in the diff**: a 25 fps source in a 30 fps project repeats a source frame every 6th project frame. The frame-diff oracle must prefer offset 0 on ties. The ADR-0016 fidelity test needs the same rule.
4. **Chromium's software H.264 encoder (openh264) inserts scene-change keyframes**, even with `keyFrame: false`. A full-frame flash became an IDR, and the "10 s GOP" fixture really had 1 s GOPs. The long-GOP fixture therefore has no flash. Impact: fixtures only, but the rate-control spike should know.
5. **WebKit's decoder holds frames back.** With the same feeding, it needed 1–5 `flush()` calls per 10-min export, while Chromium needed none. After a flush, decoding must restart at a keyframe, which costs up to a GOP with long-GOP sources. Feed further ahead on WebKit, at least 4 frames beyond the target, before flushing.
6. **Everything ADR-0006 needs works in all three engines**, from a module worker:
   - WebGL2 on `OffscreenCanvas`, including the half-float and float colour-buffer extensions;
   - `texImage2D(VideoFrame)`;
   - `new VideoFrame(OffscreenCanvas)` (with `preserveDrawingBuffer`);
   - 4:2:0 encode/decode leaves ≥ 41.6 dB luma PSNR on hardware paths.
7. **Export speed** (10 min at 1080p30, 2 decoders, cross-fades, text; set-up 0.2–0.4 s):
   - chrome (hardware H.264): **6.85×** real time, 88 s;
   - webkit: **2.82×**, 213 s;
   - chromium software: 0.39× under load 30–90 (1.24× in an earlier, quieter run).
   - The 10-min MP4 at 2.5 Mb/s is 188 MB, held in memory. SP-storage/OPFS remains necessary for phones.
8. **Seeks.** On 1 s GOPs, an exact seek costs at most 1 GOP of decode: chrome's random-seek p50 is 13–24 ms and its worst case 28–54 ms. Long GOPs cost up to 10 s of decode, 133–600 ms. Coarse-then-exact (paint the keyframe first) keeps the first visible response at 11–57 ms everywhere. Backward drags on long GOPs are the worst UX case: 47–266 ms p95 per step.

### Recommendation (provisional): **adopt ADR-0006, with amendments**

One pure `planAt` and one WebGL2 `paint` in a worker drive both preview and export with exact
frame identity and sub-millisecond A/V sync over 10 minutes in all three engines.

Amendments for the specs and architecture:
- **ADR-0010 / MOD-Export / MOD-Container:** remove the encoder delay through the MP4 edit list (AAC 2112; Opus pre-skip). Respect input edit lists.
- **ADR-0004:** measure the encoder delay in the trial encode.
- **MOD-Engine / MOD-Codec:** half-open source-frame intervals with a 2 µs tolerance (property-tested).
  - Decoder pool of 2 with ≥ 8-frame caches.
  - Coarse-then-exact seeks by default.
  - Feed ahead of the target before any `flush()`; a flush forces a keyframe restart.
- **ADR-0009:** for long-GOP sources, add an intermediate-keyframe cache to bound backward-drag cost (e.g., keep the decoded frame every ~1 s while decoding forward), or accept and document the measured worst case against NFR-03. Owner hardware data decides.
- **ADR-0016:** the fidelity oracle = the preview path at export size vs the decoded export, frame-matched with a tie-break toward offset 0. Skip spatial checks on near-black frames. Clap fixtures must be checked against the decoded source as a baseline.
- **NFR-03 seek p95:** met on hardware decode (chrome). Still unproven on Safari/iPhone, because of load noise here. → owner runs below.

### Owner must run

Run Safari 26 and Chrome (Mac), then the iPhone at `?avmin=3`, using `npm run serve` (https, port 8444; reuse the SP-codec mkcert CA).
- Never install CAs on the agent's behalf.
- No tunnels.
- Send back the downloaded JSONs.

Ideally do this with no other heavy jobs running, so the seek and playback numbers are clean.
