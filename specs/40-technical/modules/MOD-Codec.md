---
id: MOD-Codec
title: Codec — capability probe, decoder and encoder setup, output format choice
status: draft
depends_on: [MOD-Core]
---

## Responsibility
Runs the start-up capability probe (RULE-22): decode configs, encode configs per resolution and
frame rate, audio encoders, and the WebGL2 effects check and timed render (via MOD-Compositor);
produces the capability record used everywhere. Chooses the output format by ADR-0004's fallback
order, builds encoder configs from MOD-Core's bitrate tables, creates and recycles
`VideoDecoder`/`AudioDecoder`/encoders with the hardware/software retry, and drops a format for the
session when a trial encode fails.

## Not responsible for
- Scheduling decode for playback (MOD-Engine) or export (MOD-Export); reading files.

## Public surface
- `probeCapabilities()` → `Capabilities` (decode set, encodable formats per resolution and rate, effects ok, slow device).
- `chooseVideoFormat(caps, hasSound)`, `chooseAudioFormat(caps)`.
- `createVideoDecoder(config)`, `createVideoEncoder(settings)`, `createAudioDecoder`, `createAudioEncoder`.

## Implements
F-015.R1 (offers), F-016.R2 (fallback), F-023.R1–R4; RULE-01 decodability, RULE-15 Output/Resolution offers, RULE-16 audio fallback, RULE-22. Decided by ADR-0004.
