---
id: MOD-Container
title: Container — read and write media files (the only user of the container library)
status: draft
depends_on: [MOD-Core]
---

## Responsibility
A thin adapter that reads tracks, decoder configs, rotation, colour space, durations, keyframe
tables and encoded packets from a `File` in pieces (`Blob.slice`), and writes encoded packets into
MP4, WebM, M4A or Ogg on a streaming target with no metadata beyond what each format requires
(RULE-15). It is the only module that imports DEP-04 (or, if the ADR-0005 exception is declined,
the permissive fallback set), so the choice can change without touching others.

### Rules from the spikes (2026-11-04)
Evidence: SP-license, SP-codec, SP-compositor, SP-audio, SP-hdr (ADR-0005 outcome, D-042).
- "No tracks" or "a track with 0 packets" becomes a typed error (mediabunny does not throw on a
  missing moov); random bytes and damaged tables are refused without hanging.
- Presentation times come from the index (`getPacket(t + 2 µs)`); input edit lists arrive as
  negative timestamps and are left for MOD-Engine to drop.
- The reader runs in the engine and analysis workers; the writer is loaded only in the export worker
  (D-042). Writing takes the encoder-delay shift (edit list) and explicit colour tags from
  MOD-Export, and normalised AAC descriptions from MOD-Codec.
- mediabunny may report `hev1.…` for an `hvc1` sample entry; both decode.

## Not responsible for
- Decoding or encoding (MOD-Codec), choosing formats (MOD-Codec/MOD-Export), storage (MOD-Scratch).

## Public surface
- `openInput(file)` → `{ tracks, videoConfig, audioConfig, rotation, colorSpace, duration, keyframes() , packets(track, from) }`.
- `createOutput(format, sink, trackSpecs)` → `{ addVideo(packet, meta), addAudio(packet, meta), finalize() }`.
- `Sink` interface implemented by MOD-Scratch (file) and MOD-Export (memory).

## Implements
F-001.R2/R7 (reading), F-015.R4 (clean files), F-016.R2; RULE-01 (container part), RULE-15 Contents; NFR-05. Decided by ADR-0005.
