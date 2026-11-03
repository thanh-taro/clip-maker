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

## Not responsible for
- Deciding which voices exist (MOD-Plan), encoding or writing files (MOD-Export), UI.

## Public surface
- `render(audioPlan, fromSample, count)` → stereo `Float32Array`s (pure over decoded windows).
- Audio worker messages: `setProject`, `play(fromT)`, `pause`, `seek(t)`, `audition(trackId)`.
- Main thread: `clock.now()` → project time; `onEnded`.

## Implements
F-002.R2 (sound with picture), F-005.R3, F-009 (sound), F-011.R3/R5/R7, F-016.R2 (mix); RULE-06, RULE-10 sound, RULE-12 Mix and Volume; INV-02; NFR-08. Decided by ADR-0008.
