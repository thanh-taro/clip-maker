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
