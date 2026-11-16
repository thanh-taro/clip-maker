---
id: MOD-Audio
title: Audio — windowed decoding, resampling, time-stretch, mix, limiter, playback clock
status: draft
depends_on: [MOD-Core, MOD-Plan, MOD-Container, MOD-Codec]
---

## Responsibility
The deterministic mixer of ADR-0008 used by preview (audio worker → worklet) and every export:
windowed decode per voice, stereo mapping, 48 kHz resampling, own WSOLA time-stretch with fixed
sync points (pitch kept, RULE-06), linear volume and mute, fade curves (straight lines; equal power
in cross-fades), summing and the true-peak limiter (RULE-12). On the main thread side: the
`AudioContext` created in the Play gesture, the worklet node, the playback clock that the preview
follows, seeking and flushing, and bundled-music audition in the picker.

### Rules from the spikes (2026-11-04)
Evidence: SP-audio, SP-timestretch, SP-speed, SP-frame, SP-ios (ADR-0008 outcome).
- Limiter: −1.5 dBTP internal ceiling, 5 ms look-ahead, 80 ms release, 4× side-chain with 32 taps
  per phase; BS.1770-4 Annex 2 meter for compliance. The verify-and-trim pass (decode, measure,
  secant-step gain aimed at −1.5 dBTP, stop at ≤ −1.0; the first encode counts as a pass, so ≤ 3 passes means ≤ 2 trims; the excess is
  measured over −1.5 dBTP; otherwise the fallback is the last gain − 3 dB, encoded once more and not re-measured) runs in the
  export-audio worker; the final gain is shared by the video and audio-only exports of a project.
- WSOLA: Hann 40 ms, hop 20 ms, search ± 12 ms (coarse on decimated L+R, ± 4-sample refine), sync
  frame every 50 frames pinned at offset 0, no cross-fade, 1× bypass. After a seek, decode from the
  previous sync point's source position − 32 ms (up to 4 s of source at 4×).
- Playback lead 400 ms; the worklet's `MessagePort` is started explicitly; underruns counted in debug
  builds.
- `AudioContext`: set `navigator.audioSession.type = 'playback'` where present before creating it;
  create/unlock it in the first user gesture; bounded `resume()` (2 s) on `statechange` and page
  return, with `state` as the truth; if still not running, playback pauses and Play resumes it.
- Export scheduling: decode the clips' sound before the video loop starts; mix, limit, encode and
  verify alongside the video; never serially before it.

## Not responsible for
- Deciding which voices exist (MOD-Plan), encoding or writing files (MOD-Export), UI.

## Public surface
- `render(voices, sources, endSample, from, count)` → stereo `Float32Array`s (pure over decoded
  windows). It takes every voice up to `endSample`, not only those sounding in the block, because
  the limiter's 1 s pre-roll needs earlier voices. A streaming `Mixer` serves playback and
  `renderOffline` serves exports.
- Audio worker messages: `setProject`, `play(fromT)`, `pause`, `seek(t)`, `audition(trackId, length)` and
  `auditionStop(t)` (the project's plan is kept while the audition plays and comes back paused at `t`), and `feed(port)`: the
  sound feed from the worker that reads the files (MOD-Container `serveSound`; build question 83).
- `SoundBank(feed)`: windowed decoding of the sources' sound (`AudioDecoder`, stereo by fixed rules, 48 kHz
  resampling): `setSources(ids)`, `want(demand)` keeps exactly the demanded source ranges decoded,
  `ready`/`until(demand)`, `failureOf(demand)`; `get` is the mixer's source bank. `soundDemand(voices, from, to)`
  says which source ranges a range of the mix reads (after a seek: the previous sync point − 32 ms).
- Main thread: `clock.now()` → project time; `onEnded`.

## Implements
F-002.R2 (sound with picture), F-005.R3, F-009 (sound), F-011.R3/R5/R7, F-016.R2 (mix); RULE-06, RULE-10 sound, RULE-12 Mix and Volume; INV-02; NFR-08. Decided by ADR-0008.
