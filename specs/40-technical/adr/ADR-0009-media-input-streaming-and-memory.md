---
id: ADR-0009
title: Media input — read files in pieces, probe before accepting, bounded caches with a per-device memory budget
status: proposed
date: 2026-11-03
supersedes: []
---

## Context
F-001.R7 and NFR-05: memory must not grow with source size; a 4 GB source must peak within 10 % of
the same edit from a 100 MB file; a 10-minute 1080p project and a 2-minute project from 4K sources
must preview and export on the reference phone. RULE-01/02 decide acceptance from the content,
with limits on size, length and pixels; video above 3840 × 2160 (up to 5120 × 2880, D-012) is used
scaled down; large photos are scaled on load. The timeline shows clip thumbnails and waveforms
(CMP-Timeline) and the media panel shows thumbnails (CMP-MediaPanel). Up to 100 sources (RULE-02).
Scrubbing must answer within 150 ms (NFR-03), even for screen recordings with long keyframe
intervals.

## Decision
1. **Files stay files.** A source keeps its `File` reference for the session (INV-01); reads go
   through `Blob.slice()` in the container library's streaming input, so only the bytes being
   parsed are in memory. Nothing is copied into storage.
2. **Probe pipeline** (analysis worker, per file, cancellable, F-001.R6): `File.size` (RULE-02) →
   magic bytes of the first 64 bytes → container read of the track headers (duration, codec config,
   coded and display size, rotation, frame rate, colour space, sound) → limits (RULE-02) →
   `isConfigSupported` for the real configs → decode the first video frame and a first audio
   window (proves decodability, gives the media-panel thumbnail) → accepted. Photos:
   `createImageBitmap` with orientation, scaled per RULE-02 on load, then kept as one
   `ImageBitmap` sized for the largest export (≤ 4096 on its longer side for over-limit photos).
3. **Keyframe index** per video source (sample table from the container) enables seeks to the
   nearest preceding keyframe; scrubbing shows the closest cached timeline thumbnail at once and
   then the exact frame (NFR-03).
4. **Bounded caches** (all LRU, sizes set per device class at start from `navigator.hardwareConcurrency`,
   `deviceMemory` where present, and the platform):
   | Cache | Phone | Laptop |
   |---|---|---|
   | Decoded frames queued per active decoder | ≤ 6 | ≤ 12 |
   | Active video decoders (preview) | ≤ 3 (current, cross-fade partner, next clip warm-up) | ≤ 4 |
   | Timeline + media thumbnails (small bitmaps) | ≤ 24 MB | ≤ 64 MB |
   | Text bitmaps | ≤ 32 MB | ≤ 96 MB |
   | Decoded audio windows | ≤ 2 s ahead per voice, ≤ 16 voices | same |
   | Waveform peaks | ≤ 200 pairs/s, 8-bit, per source (3 h ≈ 4.3 MB) | same |
   `VideoFrame`s are closed as soon as they are drawn or evicted (decoders stall otherwise).
5. **Memory budget targets** (whole page incl. workers and GPU, measured in SP-mem-phone): phone
   ≤ 600 MB peak in preview and export; laptop ≤ 1.5 GB. Export releases preview decoders and
   caches first (ADR-0003).
6. **Source scale-down**: video above 3840 × 2160 is decoded at its size (the decoder cannot be
   asked for less) and sampled down on the GPU to fit 3840 × 2160 (ADR-0006); the project treats it
   as the scaled size everywhere (RULE-15's resolution offers included).
7. **Removing a source** releases its decoders, frames, thumbnails and peaks; its `File` reference
   stays only while the history can bring it back (ADR-0011).
8. **New project (RULE-23)** terminates the engine, audio and analysis workers and starts fresh
   ones, which releases every decoder and cache in one step.

## Alternatives considered
- **Reading whole files into `ArrayBuffer`** — breaks NFR-05 at the first large file.
- **Proxy files (transcoding sources to small editing copies)** — what desktop editors do, but it
  needs storage that outlives a step (against D-004) and doubles the work on phones.
- **Unbounded "decode everything ahead" caching** — smooth on laptops, tab crashes on phones.

## Consequences
- Memory is a function of the edit, not of file sizes; SP-mem-phone verifies with a 4 GB fixture.
- Long-GOP sources scrub coarse-then-exact; the measured worst case is recorded against NFR-03.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->

## Outcome (spikes, 2026-11-04)
Evidence: SP-license (4 GB read), SP-compositor (seeks), SP-mem-phone and SP-hdr (Mac automated;
iPhone 14 Pro Safari 27.0.1 run 1 with sources read over HTTP range requests). **The iPhone
re-run (`dec.html`, then `mem.html?tasks=t1,t2,t3` with Web Inspector memory) is still pending;
items marked (pending) may change with it.**

**Measured:**
- **Files stay files holds.** 4 GB vs 100 MB source, same edit: peak +1.8 % (Chrome), +3.4 %
  (WebKit); on the iPhone in-page proxies identical (12 frames, 79.6 MB textures). Open time of a
  40-min file 29–92 ms (Mac). mediabunny reading a 4 GB file: +77 MB renderer, JS heap 95 MB. A
  10-min 1080p export plateaus (no growth over 600 s) and streams to OPFS (438 MB file, 0 MB in
  memory); OPFS streaming also works on iOS. 0 kills (Mac, and iPhone run 1).
- **The GPU side dominates**: JS heap 3–4 MB, ≤ 13 open `VideoFrame`s; a 4K project held 318 MB of
  compositor textures (fixed by ADR-0006 outcome item 2). Mac page footprint 0.74–0.99 GB at
  1080p and 1.1–1.46 GB at 4K (no memory pressure there); the phone peak in MB is not yet measured.
- **Seeks**: 1 s keyframe spacing p95 23–53 ms (Chrome), **58 ms (iPhone)**; 10 s spacing exact
  p95 137–783 ms (Mac), **428 ms (iPhone)**, coarse first paint p95 **119 ms (iPhone)**.
- **Real iPhone HEVC broke the generated-H.264 assumptions**: B-frame reordering made the decoder
  pick frames 1–3 early (ΔE00 up to 8.9); open GOPs (CRA + leading pictures) made WebKit fail with
  `Decoder failure` and close on seek; WebKit holds frames back unless fed ≥ 12 packets ahead and
  otherwise forces `flush()` (15 flushes per decoder per minute in SP-speed).
- **iPhone run 1**: 2-min 4K HLG + SDR project → `EncodingError: Decoder failure` 35–55 s in; the
  second 4K HEVC decoder never produced a frame (the Mac runs 3 concurrent 4K HEVC decoders).
  Screen recording 3420 × 2224 decoded at ≈ 100 ms/frame over the network (preview 0.1–0.4 fps,
  seek p95 18 s; export 0.21×). 5120 × 2880 HEVC previews at 14 fps (Chrome) / 6–9 fps (WebKit) on
  the M3.

**Rule changes:**
1. **Frame selection**: the wanted frame's presentation time comes from the container index
   (`getPacket(t + 2 µs)`), never from accumulated packet durations; a frame is shown for
   `[ts, next ts)`; edit lists arrive as negative timestamps and frames before 0 are dropped by
   MOD-Engine (not the container).
2. **Random access**: after a restart at a keyframe, leading pictures with pts < the keyframe's pts
   are dropped before decoding (open GOP).
3. **Decode feed**: keep **12 packets** fed ahead of the target per decoder (was 4–6); hold at most
   12 decoded frames per decoder (measured 12–13 open). A `flush()` forces a restart at a keyframe,
   so it is used only at clip ends and seeks.
4. **Seeks**: coarse-then-exact by default — paint the nearest decoded keyframe (or cached frame) at
   once, then the exact frame. For sources whose keyframe spacing exceeds 2 s, while decoding
   forward keep a preview-size copy of about one frame per second (≤ 32 per source, counted in the
   thumbnail budget) to serve backward scrubs coarsely. NFR-03's 150 ms is met by the first visible
   response; the exact-frame worst case is recorded (iPhone 10 s GOP: p95 428 ms).
5. **Decoder budget per device class (pending `dec.html`)**: on phones, **at most one concurrent
   decoder for video above 1920 × 1080** (any codec; HEVC observed), up to 3 otherwise; laptops 4.
   A cross-fade between two such clips decodes the outgoing clip's overlap first into a bounded
   cache of frames at the target size (phone ≤ 120 MB), processing the overlap in chunks that fit
   the cache (each chunk restarts the outgoing decoder at the keyframe before it), then the incoming
   clip. Independently of the budget, a `Decoder failure` when opening an additional decoder session
   closes it and falls back to this sequential mode for the rest of the session.
6. **Slow sources**: when a source decodes slower than real time, playback never restarts at a
   keyframe while the target is still ahead of the decoder; it decodes forward and shows the newest
   frame (sound stays on the clock, F-002 edge case). Such a source is classed slow; showing
   COPY-notice.slow_device for it needs the RULE-22 change proposed at G3. 5120 × 2880 sources are a
   **known limit** (below 24 fps preview on the M3; export correct at 0.6–0.8× real time).
7. **Cache table (§4) updated**: "Decoded frames queued per active decoder" → 12 on every class;
   "Active video decoders" → item 5. Text, thumbnail and audio rows unchanged. Memory targets (§5)
   unchanged (≤ 600 MB phone, ≤ 1.5 GB laptop); whether the phone meets 600 MB at 4K is the main
   open item of the re-run.
8. **Export resolution**: RULE-15's default of 1080 already keeps above-1080 sources at ≤ 1080 by
   default; on the iPhone `VideoFrame(canvas)` costs 51 ms per frame at 3322 × 2160 vs ≈ 12 ms at
   1080 × 1920, so the export estimate (F-015.AC12) uses the measured per-pixel cost when the user
   picks 1440 or 2160.
