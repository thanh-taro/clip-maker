---
id: ADR-0008
title: Audio — our own deterministic mixer for preview and export, audio clock as master, own pitch-preserving time-stretch
status: proposed
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
   position. Project time on screen = position mapped through `getOutputTimestamp()` minus
   `outputLatency`; the main thread's frame ticks ask the engine worker for the frame at that time.
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
