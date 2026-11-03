---
id: MOD-Engine
title: Engine — preview playback and seeking in the engine worker
status: draft
depends_on: [MOD-Core, MOD-Plan, MOD-Container, MOD-Codec, MOD-Compositor]
---

## Responsibility
Owns the preview's decoders, decode-ahead queues and frame cache within ADR-0009's bounds. On each
tick (a wanted project time from the audio clock while playing, or the playhead while scrubbing),
asks MOD-Plan for the frame plan, makes sure the needed source frames are decoded (keyframe seek,
decode forward, warm up the next clip), and calls MOD-Compositor's `paint`. Scrubbing shows the
nearest cached thumbnail at once and then the exact frame (NFR-03). Renders look-gallery
thumbnails (RULE-09). Also provides the sequential "decode every frame in order" reader the export
uses.

## Not responsible for
- The audio clock and mixing (MOD-Audio), drawing details (MOD-Compositor), UI input.

## Public surface
- Worker messages: `setProject(doc)`, `tick(t, playing)`, `seek(t)`, `setTextBitmaps(...)`, `lookThumbnails(clipId)`, `release()`.
- Events: `frameShown(t)`, `stalled`, `sourceError(id)`.
- `SequentialFrameReader` for exports.

## Implements
F-002.R1–R4/R6, F-008.R1 (thumbnails), F-013 scrub response; NFR-03, NFR-05. Decided by ADR-0003, ADR-0009.
