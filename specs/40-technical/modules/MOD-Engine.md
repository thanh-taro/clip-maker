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

### Rules from the spikes (2026-11-04)
Evidence: SP-compositor, SP-hdr, SP-mem-phone, SP-speed (ADR-0009 outcome).
- A frame lasts until the next frame's start: display interval `[ts, next ts)`; never rounded
  chunk durations (only when the next frame is unknown, up to 2 µs before its end). Property-tested
  across 24/25/30/60 fps sources and projects.
- The wanted frame's presentation time comes from the container index (`getPacket(t + 2 µs)`),
  never from packet durations (HEVC B-frames otherwise give frames 1–3 early). Frames with negative
  times (input edit lists) are dropped.
- After a random-access restart, drop open-GOP leading pictures (pts < the keyframe's pts) before
  decoding; WebKit fails and closes the decoder otherwise.
- Feed 12 packets ahead of the target per decoder; hold ≤ 12 decoded frames per decoder; `flush()`
  only at clip ends and seeks (it forces a keyframe restart).
- Seeks are coarse-then-exact (nearest decoded keyframe or cached frame first); for sources with
  keyframe spacing > 2 s keep about one preview-size frame per second (≤ 32 per source) for backward
  scrubs.
- Decoder budget per device class (ADR-0009 outcome item 5): phones ≤ 1 concurrent decoder for video
  above 1920 × 1080 (≤ 3 otherwise), laptops ≤ 4; cross-fades between two such clips decode the
  outgoing overlap first into a bounded target-size cache, in chunks. A `Decoder failure` when
  opening an extra session falls back to that sequential mode for the session (pending `dec.html`).
- Playback when decode is slower than real time: never restart at a keyframe while the target is
  still ahead of the decoder; decode forward and show the newest frame. Report such a source as slow
  (`slowSource(id)`).
- On `webglcontextlost` the engine asks MOD-Compositor to recover and repaints the current plan
  (the preview always recovers).

## Not responsible for
- The audio clock and mixing (MOD-Audio), drawing details (MOD-Compositor), UI input.

## Public surface
- Worker messages: `setProject(doc)`, `tick(t, playing)`, `seek(t)`, `setTextBitmaps(...)`, `lookThumbnails(clipId)`, `release()`.
- Events: `frameShown(t)`, `stalled`, `sourceError(id)`, `slowSource(id)`.
- `SequentialFrameReader` for exports.

## Implements
F-002.R1–R4/R6, F-008.R1 (thumbnails), F-013 scrub response; NFR-03, NFR-05. Decided by ADR-0003, ADR-0009.
