---
id: MOD-Media
title: Media — intake, probing, source registry, thumbnails and waveforms
status: draft
depends_on: [MOD-Core, MOD-Container, MOD-Codec]
---

## Responsibility
Takes files from pick, drop and paste (ignoring folders), checks each by content against RULE-01
and RULE-02 in the analysis worker (size, magic bytes, container headers, limits, real decoder
configs, first frame and first sound window), reports progress and supports cancel (F-001.R6), and
keeps the **source registry**: source id → `File`, probe results, keyframe index, photo bitmap.
Makes media-panel and timeline thumbnails and waveform peaks within the cache bounds of ADR-0009.
Releases a source's caches on removal and New project; keeps the `File` reference while history
can restore it.

## Not responsible for
- Deciding placement on the tracks (MOD-Core/MOD-Project), playback decoding (MOD-Engine).

## Public surface
- `intake(files, onProgress, signal)` → accepted sources and refusals with COPY- reason ids.
- `registry.get(id)`, `registry.retain/release(id)`.
- `thumbnails(sourceId, timeRange, height)`, `waveform(sourceId, range)` (async, cached).

## Implements
F-001.R1/R2/R5/R6/R7, F-023.R2; RULE-01, RULE-02 (incl. D-012 scale-down sizes); INV-01; NFR-05. Decided by ADR-0009.
