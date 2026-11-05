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

### Rules from the spikes (2026-11-04)
Evidence: SP-codec (incl. owner runs), SP-compositor, SP-audio, SP-speed, SP-size-target, SP-hdr
(ADR-0004 outcome).
- Start-up probe = minimal set (decode at 1080p, one encode per codec at 1080p30, AAC-LC and Opus,
  effects check), ≤ 300 ms (measured 32–54 ms). The size × rate grid is probed when the export
  panel opens, for the chosen codec only. At most 4 `isConfigSupported` calls at once.
- AAC descriptions starting with tag `0x03` are reduced to the 2-byte AudioSpecificConfig.
- A source counts as decodable only after its first packets decode (WebKit FLAC is a false positive).
- Trial encode: `latencyMode:'quality'`, falling back to `'realtime'` when no chunk arrives within
  2 s; measures encoder delay by impulse round trip; records the working mode, hardware vs
  software H.264, supported `bitrateMode`s, the delivered AAC rate, and whether HDR frames are
  opaque or decoder tone-mapped. Never use WebKit's Opus encoder; no Opus below 128 kbps.

## Not responsible for
- Scheduling decode for playback (MOD-Engine) or export (MOD-Export); reading files.

## Public surface
- `probeCapabilities()` → `Capabilities` (decode set, encodable codecs at 1080p30, effects ok, slow device, encoder mode/hardware/bitrate modes/delivered AAC rate after the trial, HDR frame kind).
- `probeExportGrid(codec)` → encodable sizes × rates, run when the export panel opens.
- `deviceCheck(caps)` → the failed RULE-22 checks; encoding needs a video encoder only. `soundExportAvailable(caps)` → whether any sound encoder passed; without one the device stays supported and only exports that need a sound encoder are left out (F-023.R5).
- `chooseVideoFormat(caps, hasSound)`, `chooseAudioFormat(caps)`.
- `createVideoDecoder(config)`, `createVideoEncoder(settings)`, `createAudioDecoder`, `createAudioEncoder`.

## Implements
F-015.R1 (offers), F-016.R2 (fallback), F-023.R1–R4; RULE-01 decodability, RULE-15 Output/Resolution offers, RULE-16 audio fallback, RULE-22. Decided by ADR-0004.
