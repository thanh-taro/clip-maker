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

## Not responsible for
- Decoding or encoding (MOD-Codec), choosing formats (MOD-Codec/MOD-Export), storage (MOD-Scratch).

## Public surface
- `openInput(file)` → `{ tracks, videoConfig, audioConfig, rotation, colorSpace, duration, keyframes() , packets(track, from) }`.
- `createOutput(format, sink, trackSpecs)` → `{ addVideo(packet, meta), addAudio(packet, meta), finalize() }`.
- `Sink` interface implemented by MOD-Scratch (file) and MOD-Export (memory).

## Implements
F-001.R2/R7 (reading), F-015.R4 (clean files), F-016.R2; RULE-01 (container part), RULE-15 Contents; NFR-05. Decided by ADR-0005.
