# Spike SP-audio (blocking)

Frame: row 6 of the spike table in `architecture-proposal.md` §5. Decides ADR-0008 (own mixer,
worklet clock, true-peak limiter) and ADR-0003 §3 (audio worker → worklet over `MessagePort`).
Specs: RULE-10 (fade curves), RULE-12 (volume, mute, limiter ≤ −1 dBTP), F-011.AC5, NFR-08, MOD-Audio.

**Question.** Does our own mixer, run in an audio worker and played by an `AudioWorklet` fed over a
`MessagePort`, play glitch-free and produce exactly the same samples as the export? Which internal
limiter ceiling keeps the **decoded** AAC and Opus exports at or below −1 dBTP?

**Hypothesis.**
- A worker mixer streaming ~250 ms ahead in transferred `ArrayBuffer`s gives 0 underruns over
  10 minutes without `SharedArrayBuffer` (no COOP/COEP).
- The export path calls the same `render()` and matches an offline reference to float rounding.
- Audio-only and video exports render the same samples (offset 0, well inside 1 ms).
- AAC and Opus overshoot the PCM true peak by ≤ 0.5 dB, so a −1.5 dBTP internal ceiling is safe
  (ADR-0008 starting value).
- One voice costs well under 1 % of a laptop core; the Web Audio graph variant is cheaper in CPU but
  cannot meet the limiter rule or bit-exactness between realtime and offline.

**Measures.**
1. Underruns (worklet quanta with an empty queue) and late blocks over 10 min of playback, screen on.
2. Sample diff of the export path vs an independent offline reference (max abs, RMS, first bad index).
3. Audio-only vs video-export sound alignment: clap onset offset in samples (≤ 48 = 1 ms).
4. Decoded true peak (4× oversampled, BS.1770-4 style) of AAC (M4A) and Opus (Ogg/WebM) exports, per
   engine, across ceilings; the ceiling that guarantees ≤ −1 dBTP with margin.
5. CPU per voice (render time vs real time) for the mixer and the limiter; JS heap / RSS.
6. Web Audio graph variant: same plan through `OfflineAudioContext` and realtime graph; sample diff
   vs the reference; whether it can hold −1 dBTP.

**Pass criteria** (from the spike table).
- 0 underruns over 10 min on phones with the screen on (automation: laptop Chromium + WebKit;
  owner: Firefox, iPhone).
- Export sound = reference within float rounding (max abs diff ≤ 1e-6 on float; ≤ 1 LSB on 16-bit WAV).
- Audio-only vs video sound ≤ 1 ms.
- Decoded true peak ≤ −1 dBTP for AAC and Opus on the stress material → fixes the margin.

**Time box.** 2 days of agent work.

**Not built.** No resampling, no time-stretch (SP-timestretch), no windowed decoding of real sources
(test signals are generated in memory), no video encode (the "video export sound" path is the same
audio encoder run inside an MP4 with a placeholder video-length timeline; picture sync is
SP-compositor), no UI beyond a test page, no app code. Android deferred (D-037).

**Devices.** MacBook (Apple M3): Playwright Chromium and WebKit (automated), Firefox and Safari
(owner); iPhone Safari over HTTPS on the LAN with a mkcert certificate (owner). No CA installed by
the agent, no tunnels.

---

## Results (2026-11-03, automated part; branch `spike/audio`)

Status: **automated part done**. Playwright Chromium 156 and WebKit 27.2 on a MacBook (Apple M3), both
headless. Firefox, Safari 26 and the iPhone are waiting on the owner (steps in `spikes/audio/README.md`).
Time used: about 0.7 d of the 2 d box.

Prototype: `spikes/audio/`. Raw data is in `spikes/audio/results/*.json`, with summaries in
`results/summary-export.txt` and `results/ceiling-table.txt`. `node tools/summarize.mjs` reprints them.
The exported files (753 MB) are git-ignored; the export page regenerates them.

### Against the pass criteria

| Criterion | Result | Verdict |
|---|---|---|
| 0 underruns over 10 min | **0 underrun quanta** in Chromium (599.5 s played) and in WebKit (599.6 s). Lowest worklet queue: 2816 / 2944 frames (59 / 61 ms). Worker render per 1024-frame block: max 8.6 / 10 ms, mean 0.40 ms | **pass** (laptop); phones are owner runs |
| Played = export | The worklet's FNV hash of the first 30 s played equals the export-path render, in both engines and in every stress run | **pass** |
| Export = offline reference | Max abs diff **2.98e-8** (−150.5 dBFS), RMS 1.06e-8, **0 samples beyond float32 rounding**, in Node, Chromium and WebKit. Identical hash for 1600-frame and random 1–4096-frame blocks. Mute = voice removed (bit-exact). Seek with 1 s pre-roll vs continuous render: max 6e-8. 16-bit WAV vs PCM: ≤ 0.5 LSB | **pass** |
| Audio-only vs video export sound ≤ 1 ms | Audio-only M4A/Ogg/WebM vs MP4 with H.264: **lag 0 samples, max diff 0**, for AAC and Opus, in both engines (the same encoded packets muxed twice) | **pass**, but see priming below |
| Decoded true peak ≤ −1 dBTP | **Not met by any fixed ceiling ≥ −4 dBTP** on the stress material. **Met** by a verify-and-trim loop (below) | **adapt** |

### Codec priming (a new risk for NFR-08's 40 ms A/V budget)

- **AAC:** the encoder delay is **2112 samples (44.0 ms)** in both engines. Chunk timestamps start at 0, so
  mediabunny writes no edit list. WebCodecs + mediabunny decoding then plays the sound 44 ms late, which
  is over the 40 ms A/V budget. CoreAudio (`afconvert`) trims 2112 samples on its own.
  - **Fix measured:** shift the audio packet timestamps by −44 000 µs. mediabunny then writes an edit
    list, and the clap offset is **0 samples** in mediabunny, in both engines and in CoreAudio.
- **Opus:** the pre-skip is **312 samples (6.5 ms)**.
  - Without a fix, mediabunny reports the first sample at +6.5 ms, and the clap offset is 312 samples
    in Ogg, WebM and MP4.
  - With the timestamps shifted by −6500 µs, the offset is **0 in Ogg and MP4**, and **−24 samples
    (−0.5 ms) in WebM**, because of WebM's 1 ms timecode resolution.

### True peak after the codec (BS.1770-4 Annex 2 4× meter; "strict" = 128-tap meter, within ±0.2 dB)

Material:
- `stress`: music at 200 % + loud video sound at 200 % + music with inter-sample tones at 200 %.
- `p60`: 3 voices, fades, a 1 s equal-power cross-fade, music at 200 %.

The limiter takes off up to 11 dB. Values are the worst decoded peak of the two plans (`results/ceiling-table.txt`):

| Internal ceiling → decoded dBTP | −1.0 | −1.5 | −2.0 | −2.5 | −3.0 | −4.0 | max overshoot |
|---|---|---|---|---|---|---|---|
| Chromium AAC 192k | +0.60 | +0.06 | −0.18 | −0.78 | −0.44 | **−1.73** | 2.38 dB |
| Chromium AAC 128k | +1.34 | +1.25 | +0.13 | +0.23 | −0.13 | **−1.08** | 2.73 dB |
| Chromium Opus 160k | +0.61 | +0.04 | −0.54 | −0.46 | **−1.20** | −1.98 | 1.87 dB |
| Chromium Opus 128k | +1.16 | +0.27 | +0.24 | −0.60 | −0.48 | **−1.57** | 2.34 dB |
| Chromium Opus 96k | +1.59 | +1.00 | +0.41 | +0.27 | −0.45 | −0.89 ✗ | 2.93 dB |
| WebKit AAC (any bitrate; actual ≈ 98 kbps) | +0.73 | +0.11 | +0.06 | −0.18 | −0.08 | **−1.66** | 2.74 dB |
| WebKit Opus 96/128/160k (own decoder, which clips) | +1.4 | +1.3 | +0.9…1.1 | +0.6…1.0 | +0.5…0.8 | +0.2…0.7 ✗ | 4.0–4.5 dB |

- **The overshoot does not fall as the ceiling is lowered.** At the worst spots, the PCM is about −4 dBTP and
  the codec itself makes a peak about 3 dB higher (local SNR 22 dB; `tools/dbg.mjs`). A fixed ceiling
  therefore needs **≈ −4.5 dBTP** to hold on AAC: −4 has only 0.08 dB margin on Chromium AAC 128k. That
  gives up 3 dB of loudness on every export, and Opus 96k still fails.
- A 16 kHz low-pass before the limiter made things **worse** (+0.1 to +0.7 dB): rejected.
- **Verify-and-trim** (`results/export-*-only-verifyDb.json`): encode, decode, and measure. If the result is
  above −1.3 dBTP, scale the PCM by (excess + 0.2 dB) and encode again, at most 3 passes.
  - Chromium: all 20 cases (AAC 128/192k, Opus 96/128/160k × 2 plans × ceilings −1.5/−2) end at
    **−1.17 to −2.15 dBTP**. 19 of them need 2 passes and 1 needs 3.
  - WebKit AAC: all 8 cases end at **−1.30 to −2.34 dBTP** within 3 passes.
  - Cost per pass for 60 s of audio: measure ≈ 0.5 s and re-encode ≈ 0.4 s in Chromium, 0.35 s + 0.3 s in
    WebKit. That is about 10 s per extra pass for a 10-minute project on the laptop.
- **WebKit's Opus encoder is unusable for this:**
  - Its output decodes to **+2.97 dBTP in Chromium** (stress at −1.5; p60: +4.1), while WebKit's own decoder
    **clips at 0 dBFS** (sample peak exactly 0.0).
  - A 4 dB trim still leaves it at −0.3 to −0.8 dBTP.
  - SNR vs PCM is 3.5 dB, against 19.8 dB for Chromium's Opus.
  - WebKit uses AAC anyway (SP-codec), so Opus stays a Firefox/fallback path and has to be measured in
    Firefox.
- **WebKit's AAC encoder ignores `bitrate`:** 128k and 192k give byte-identical files (733 KB/min ≈ 98 kbps).
  This is input for SP-size-target and ADR-0004.
- The decoders agree: AAC decodes to the same peaks in Chromium, WebKit and CoreAudio (`results/cross-decode.json`,
  `results/afconvert-check.json`).

### Limiter side-chain and meter

- With a 16-tap (8 per side) Kaiser 4× side-chain, the PCM reads −1.26 dBTP on BS.1770 but **−0.32 on the strict meter**
  at a −1.5 ceiling (`tools/detector-sweep.mjs`). The material has energy near Nyquist.
- A **32-tap (k16) side-chain** keeps BS.1770 ≤ −1.35 and strict ≤ −0.80 (p60) or −1.21 (stress), at about 1 % of a
  core in Node. Adopted as the default.
- The compliance meter in this spike is BS.1770-4 Annex 2. The strict reading is recorded next to it.

### CPU and memory

- **Mixer:** 0.03 to 0.1 % of one core per voice in Node and Chromium, up to 0.33 % in WebKit.
- **Limiter:** 1 to 2.5 % of one core, the same for 1 to 12 voices. WebKit with 12 voices: 3.6 % in total.
- **Playback audio worker** (3 voices + limiter, real time): 1.97 % of a core in Chromium, 1.76 % in WebKit.
- **JS heap:** 9.5 MB, flat over 10 min (Chromium). The sources are 4 × 10 s of stereo float32 = 15 MB.
- **Browser process tree RSS** over 10 min: Chromium 352–451 MB, WebKit 93–118 MB. No growth.
- **Drift:** context time minus frames played stayed constant within 10 ms over 10 min (the residual is
  stats-message staleness, not drift).

### Stress playback (3 min each)

- **Main-thread jank** (120 ms busy every 250 ms; 86 s of jank in total): **0 underruns** in both engines.
  The minimum queue in WebKit fell to 896 frames.
- **Audio-worker stall** (150 ms every 2 s, with the WebKit export running on the same machine):
  - At a **250 ms buffer**: Chromium 0 underruns; **WebKit 4 events / 98 quanta (~260 ms of silence)**.
    WebKit's worklet queue sits about 190 ms below the worker's target, because the consumption reports
    arrive late.
  - At a **400 ms buffer**: **0 underruns** in both engines (minimum queue 4864 / 3712 frames).

### Web Audio graph variant (`OfflineAudioContext`, gain automation, `setValueCurveAtTime`, `DynamicsCompressorNode`)

- Mix vs reference:
  - Steady state is **exact**.
  - The **cross-fade differs by up to 1.4e-6** (curve interpolation): 242 k samples in Chromium and 702 k in
    WebKit are beyond float rounding.
  - **Chromium renders differ between two identical runs.**
- Render time for 60 s: **36 ms** (Chromium) / 78 ms (WebKit). The own mixer takes 1.2 s / 1.4 s, including the limiter.
- `DynamicsCompressorNode` (threshold −1.5, ratio 20, attack 1 ms) lets the peak reach **+3.15 dBTP**, which
  breaks RULE-12.
- This confirms ADR-0008's rejection of the graph: no true-peak limiting, not deterministic, and it differs
  from realtime playback.

### What surprised us

1. Codec overshoot of 2 to 3 dB (AAC/Opus) that **does not shrink with a lower ceiling**. A fixed margin
   cannot satisfy F-011.AC5 at a sane loudness.
2. AAC priming (44 ms) is silently left in by the mediabunny write path and the WebCodecs read path, but
   CoreAudio trims it. A naive build would fail the 40 ms A/V budget only in some players.
3. WebKit: the AAC bitrate is ignored, the Opus encoder overshoots by 4 dB, and the Opus decoder clips.
4. The meter matters: a 16-tap 4× side-chain under-reads by 1.2 dB on material with energy near Nyquist.
5. The worklet queue in WebKit runs about 190 ms below the worker's target, so 250 ms of lead was not enough
   for a 150 ms worker stall.
6. Two Playwright runs (an early WebKit export and a foreground playback smoke test) were killed with exit
   code 144 when launched in the foreground. The same runs under `nohup` in the background completed. This
   is the harness, not the browsers.

### Recommendation (provisional): **adapt**

ADR-0008 stands: our own mixer, shared by preview and export, the worklet over a `MessagePort`, no
`SharedArrayBuffer`. Amend it as follows:

1. **Limiter:**
   - **internal ceiling −1.5 dBTP**, look-ahead 5 ms, release 80 ms;
   - a **32-tap-per-phase 4× side-chain**;
   - compliance measured with the **BS.1770-4 Annex 2** meter.

   WAV and the preview need nothing more (PCM ≤ −1.35 dBTP).
2. **Lossy exports (AAC, Opus): mandatory verify-and-trim.**
   1. Encode the audio first.
   2. Decode and measure the true peak.
   3. If it is above −1.3 dBTP, apply a global gain of −(excess + 0.2 dB) and encode again, at most 3 passes.
   4. If it still fails after 3 passes, take a fixed trim of −3 dB and record that.

   The audio packets of a 10-minute project are about 14 MB, so they are held until they are muxed with the
   video (ADR-0010). The audio-only and video exports must use the same final gain, to keep NFR-08's 1 ms.

   *Alternative if the owner rejects the extra pass:* a fixed internal ceiling of **−4.5 dBTP**. It costs about
   3 dB of loudness and still fails on Opus 96k.
3. **Priming compensation in MOD-Export:**
   - AAC: packet timestamps −2112 samples, which gives an edit list in MP4/M4A.
   - Opus: −312 samples.
   - Add a clap-fixture test that checks a 0-sample offset after decoding with mediabunny and with CoreAudio.
4. **Playback buffer 400 ms** of lead in the audio worker (not 250 ms). Underruns and the queue low-water mark
   are counted in the worklet in debug builds.
5. **Opus:**
   - never use WebKit's Opus encoder for export; WebKit's chain is AAC (or WAV);
   - do not use Opus below 128k;
   - measure Firefox's Opus with the verify loop.
6. **ADR-0004 / SP-size-target:** WebKit's AAC ignores `bitrate` (≈ 98 kbps), so size estimates for
   Safari must use the measured rate.
7. **Spec S-4 / F-011.AC5:** no wording change is needed. AC5 holds on decoded files through the verify loop.
   Add a note to NFR-04 that a lossy export may take up to 2 extra audio passes (≈ 10 s per 10 min on the laptop).

### Still open (owner runs)

- iPhone Safari 26: 10-minute playback with the screen on (normal and Low Power Mode), and the export page.
  Phones are the actual pass criterion for underruns.
- Firefox: playback, its Opus encoder overshoot, and the verify loop. Safari 26 (macOS): the same as the
  WebKit results, to confirm.
- Android (D-037, deferred).
