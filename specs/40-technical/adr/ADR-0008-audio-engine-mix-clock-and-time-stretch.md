---
id: ADR-0008
title: Audio — our own deterministic mixer for preview and export, audio clock as master, own pitch-preserving time-stretch
status: accepted
date: 2026-11-03
supersedes: []
---

## Context
RULE-12: per-clip linear volume 0–200 % (50 % = −6.0 dB), mute, the sum of all unmuted sound
through a limiter that keeps the true peak ≤ −1 dBTP. RULE-10: straight-line clip fades, an
equal-power curve in cross-fades, straight-line audio-clip fades. RULE-06 and F-005.R3: speed
0.25×–4× with the original pitch (F-005.AC2: 440 Hz ± 1 % at 2×, preview and export). INV-02 and
NFR-08: the same sound in preview and export; the picture within 40 ms of the sound over 10
minutes; the audio-only export sample-aligned with the video export's sound within 1 ms. Sources
can be 3 hours long (RULE-02) and must not be decoded whole (NFR-05). Web Audio's own nodes differ
between engines (resampling, `DynamicsCompressorNode` is not a true-peak limiter) and between
realtime and offline contexts. The usual time-stretch libraries are LGPL (SoundTouch, also its
worklet wrapper's core) or GPL (Rubber Band) — not allowed at runtime by ADR-0001. Signalsmith
Stretch is MIT but ships as WebAssembly, which needs `'wasm-unsafe-eval'` in the CSP.

## Decision
1. **One mixer, written by us** (MOD-Audio), pure TypeScript over `Float32Array` blocks at
   48 kHz stereo. `render(audioPlan, fromSample, count)` produces the mix for any range. Preview
   (audio worker → worklet) and every export (export worker → `AudioEncoder` or the WAV writer)
   call the same function with plans from MOD-Plan.
2. **Per-voice chain**: decode window (`AudioDecoder`, WAV parsed directly) → downmix/upmix to
   stereo by fixed rules → resample to 48 kHz (windowed-sinc polyphase, fixed taps) →
   time-stretch when speed ≠ 1 → gain (volume × fade curve; equal-power `cos/sin` in cross-fades;
   straight lines elsewhere; mute = 0) → sum.
3. **Limiter**: look-ahead true-peak limiter with 4× oversampled peak detection (ITU-R BS.1770
   style), ceiling below −1 dBTP by a margin that covers encoder overshoot (start −1.5 dBTP; SP-audio
   measures the decoded AAC/Opus overshoot and fixes the margin so F-011.AC5 holds on decoded
   files). Deterministic, no randomness.
4. **Time-stretch: our own WSOLA** (waveform-similarity overlap-add) on the stereo pair with shared
   offsets, window ≈ 40 ms, search ± 12 ms, run on resampled audio. To make it seekable and
   identical between preview and export, the analysis chain **restarts at fixed sync points** every
   1 s of clip output time, with a short cross-fade; any position is rendered by starting at the
   previous sync point. **Fallback**: Signalsmith Stretch (DEP-40, MIT) if SP-timestretch shows our
   WSOLA is not acceptable on music at 0.5× and 2×; adopting it needs a superseding ADR that adds
   `'wasm-unsafe-eval'` to the CSP (ADR-0014).
5. **Clock and sync**: playback creates `AudioContext({ sampleRate: 48000, latencyHint:
   'interactive' })` in the Play gesture. The worklet plays blocks the audio worker streams ahead
   (≈ 250 ms buffer, transferred `ArrayBuffer`s over a `MessagePort`) and reports the sample
   position. Project time on screen = position mapped through `getOutputTimestamp()` (which already
   describes what reaches the speakers), carried forward to now; without a timestamp,
   `currentTime − outputLatency − baseLatency`; the main thread's frame ticks ask the engine worker for the frame at that time.
   The picture follows the sound, so drift cannot accumulate; a silent project still plays through
   the same clock. Seek = flush the queue, re-render from the new position (the limiter pre-rolls
   1 s so its state matches the export closely).
6. **Decoding** is windowed: the audio worker keeps ≈ 2 s decoded ahead per active voice and a
   small back-buffer for scrubbing; nothing proportional to source length is kept except
   waveform peaks (ADR-0009).
7. **Picker audition** of bundled music (F-011.R1) uses the same path with a one-voice plan.

## Alternatives considered
- **Web Audio graph (`AudioBufferSourceNode`, `GainNode`, `OfflineAudioContext` in chunks)** —
  native and fast, but realtime and offline rendering differ, `playbackRate` changes pitch,
  chunk seams need care, there is no true-peak limiter, and whole-buffer decoding conflicts with
  NFR-05. Was the original SP-audio idea; replaced by this design and kept as a measured
  comparison in the spike.
- **SoundTouch / Rubber Band** — LGPL / GPL, not allowed (ADR-0001).
- **Phase vocoder (own)** — better for slow-down of tonal music, more code, phasiness on speech;
  WSOLA suits speech-heavy phone video. SP-timestretch compares both on the fixtures.
- **Signalsmith Stretch now** — best quality, but WebAssembly means relaxing the CSP for every
  user; only if our own code fails.

## Consequences
- Sound in preview and export is the same code path; audio-only and video exports render the same
  samples (NFR-08's 1 ms).
- Pending conditions: SP-audio (mix accuracy, worklet stability, A/V drift) and SP-timestretch
  (quality, 440 Hz test, CPU on phones).
- ~1.5–2k lines of DSP code, unit-tested against analytic signals (tones, impulses, clap fixtures).

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->

## Outcome (spikes, 2026-11-04)
Evidence: SP-audio, SP-timestretch (incl. owner iPhone bench and blind listening), SP-speed,
SP-frame, SP-ios (iPhone 14 Pro Safari 27.0.1), SP-gpu-color (iOS gesture finding).

**Measured:**
- **Mixer and worklet**: 0 underruns over 10 min in Chromium and WebKit; played samples hash-equal
  to the export render; export vs offline reference max abs diff 2.98e-8 (float rounding); mute is
  bit-exact; seek with 1 s limiter pre-roll vs continuous render ≤ 6e-8; audio-only vs video sound
  offset **0 samples**. Mixer 0.03–0.33 % of a core per voice; limiter 1–2.5 %; playback worker
  ≈ 2 %. JS heap flat (9.5 MB).
- **Web Audio graph variant**: cross-fades differ up to 1.4e-6, Chromium renders differ between
  identical runs, `DynamicsCompressorNode` lets peaks reach +3.15 dBTP. **Rejected** (as §Alternatives
  said).
- **Codec overshoot**: decoded AAC/Opus exceed the PCM true peak by 1.9–2.9 dB (WebKit Opus 4–4.5 dB),
  and the overshoot does **not** shrink with a lower ceiling; a fixed ceiling would need ≈ −4.5 dBTP
  and still fails Opus 96k.
- **Priming**: AAC encoder delay 2112 samples (44.0 ms) in every engine; Opus pre-skip 312 samples.
  Left in, sound plays 44 ms late per encode (88 ms after one export of an AAC source).
- **Buffer**: at 250 ms lead WebKit had 4 underrun events (≈ 260 ms silence) under a 150 ms
  worker stall, because its worklet queue runs ≈ 190 ms below target; at **400 ms** 0 underruns in
  both engines.
- **Time-stretch**: own WSOLA keeps 440 Hz within **0.001 %** at all 76 steps (preview and export);
  bit-exact from any seek, between preview and export **and across engines**; CPU 0.8–1.5 % of an
  M3 core per stereo voice in browsers, **0.35–0.39 % on the iPhone**; worst seek render ≤ 12 ms
  (≤ 4 ms iPhone). Own phase vocoder: 3–4× the CPU, not deterministic across engines, smears
  attacks, and its seek-safe phase resets dip steady tones by up to 13.8 dB. Owner blind listening
  (9 trials): WSOLA mean 3.67, never below 3; PV mean 3.22, lowest 1 (music at 2×).
- **iPhone**: Web Audio is muted by the ring/silent switch unless `navigator.audioSession.type =
  'playback'` is set; the `AudioContext` only starts inside a user gesture; after lock, app switch,
  Siri or a notification the context returned to `running` on its own (A4 went through
  `interrupted`). WebKit's `resume()` sometimes never settles (Playwright WebKit). The standalone
  iPhone page refused the same-origin worklet module over CORS (embedded passed).

**Rule changes:**
1. **§3 limiter**: internal ceiling **−1.5 dBTP**, look-ahead 5 ms, release 80 ms, 4× side-chain with
   **32 taps per phase** (16 taps under-read by 1.2 dB near Nyquist). Compliance is measured with a
   BS.1770-4 Annex 2 meter. WAV and preview need nothing more (PCM ≤ −1.35 dBTP).
2. **§3 verify-and-trim (new, lossy exports)**: after encoding the whole mix, decode and measure the
   true peak. If above **−1.0 dBTP** (the NFR/F-011.AC5 limit), apply a global gain aimed at
   **−1.5 dBTP decoded**, using the measured gain→peak slope from the previous pass (secant step;
   first step = the excess over −1.5 dBTP + 0.2 dB), and encode again; at most **3 passes**, counting
   the first encode (so at most 2 trims); if still above −1.0 after 3, apply the last gain − 3 dB,
   encode once more without measuring again, and record it. (The fixed-step rule measured in SP-speed needed
   3 passes and ended at −2.58 dBTP in Chrome, −1.18 in WebKit and on the iPhone.) The video export
   and the audio-only export of the same project use the same final gain (NFR-08's 1 ms and
   identical sound). Cost ≈ 0.4–1 s per pass per minute of audio on the laptop.
3. **Priming removal**: MOD-Export shifts encoded audio packet times by the encoder delay measured in
   the trial encode (AAC 2112, Opus 312 samples) so the container writes an edit list; decoders
   (ours via mediabunny, CoreAudio) then start at sample 0 (measured 0-sample offset; WebM 1 ms
   timecode resolution leaves −0.5 ms). Input edit lists are honoured on read.
4. **§4 WSOLA adopted, phase vocoder rejected, Signalsmith (DEP-40) not needed.** Parameters: Hann
   window 40 ms, output hop 20 ms, search ± 12 ms (coarse on the L+R sum decimated × 4, then ± 4
   samples at full rate), normalised correlation over the 20 ms overlap; analysis position
   `round(j × hop × speed)` per frame, never accumulated; a **sync frame every 50 frames (1 s of
   output) pinned at offset 0 with no cross-fade** (replaces "a short cross-fade"); 1× bypasses
   the stretch. Known limits (for QA and F-005 notes): doubled attacks at ≤ 0.5×; about 23 % of very
   short clicks lost at 2× and 35 % at 4×; 3–7 ms attack timing jitter. Longer windows below 1× are
   an M-2 candidate.
5. **§6 decoding after a seek** starts at the previous sync point's source position minus 32 ms,
   i.e. up to `1 s × speed` of source before the seek point (4 s at 4×).
6. **§5 clock and buffer**: lead **400 ms** (was ≈ 250 ms); underruns and the queue low-water mark
   always counted in the worklet (cheap); the stats are returned only on request. The worklet's `MessagePort` is started explicitly
   (`port.start()` when using `addEventListener`).
7. **§5 context lifecycle**: on iOS set `navigator.audioSession.type = 'playback'` (where present)
   before creating the `AudioContext`; create/unlock the context inside the **first user gesture**
   (not only Play). Never `await resume()` unbounded: the context `state` and `statechange` are the
   truth; on `statechange` away from `running` (incl. `interrupted`) and on page return, try a
   bounded `resume()` (2 s); if it is still not running, playback pauses and Play resumes it.
   Whether sound playing with the silent switch on is wanted is an owner decision (proposed spec
   change, G3).
8. **Worklet module delivery**: the worklet script is served with
   `Access-Control-Allow-Origin: <tool origin>` (ADR-0014) and re-checked on iOS standalone in QA.
9. **Export scheduling**: the export-audio worker decodes the clips' sound before the video loop
   starts, then mixes, limits, encodes and verifies alongside the video (ADR-0003 outcome,
   ADR-0010). Never serially before the video.
10. **Determinism**: WSOLA output hashes are identical across engines and become golden test oracles
    (ADR-0016).
