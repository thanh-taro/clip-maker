---
id: ADR-0005
title: Reading and writing media files — mediabunny under a scoped MPL-2.0 exception (pending SP-license and the owner)
status: proposed
date: 2026-11-03
supersedes: []
---

## Context
WebCodecs decodes and encodes samples; it does not read or write files. The tool must read
MP4/MOV, WebM/Matroska and audio files (MP3, ADTS AAC, M4A, WAV, Ogg/Opus, FLAC, WebM audio)
(RULE-01) piece by piece from files up to 4 GB and 3 hours (RULE-02, F-001.R7, NFR-05), handle
rotation metadata, edit lists, variable frame rates and moov-at-end files, and write MP4, WebM, M4A
and Ogg (ADR-0004) without holding the whole output in memory.

Registry check on 2026-11-03:
| Package | Version, date | Licence | Reads | Writes | State |
|---|---|---|---|---|---|
| mediabunny | 1.65.0, 2026-10-30 | MPL-2.0 | MP4, MOV, WebM, MKV, Ogg, MP3, WAV, ADTS, FLAC (+TS, HLS) | MP4 (fast start / fragmented), MOV, WebM, MKV, Ogg, WAV, ADTS, FLAC… | active, zero dependencies besides type packages, tree-shakable, streaming input and output |
| mp4box (mp4box.js) | 2.5.0, 2026-10-25 | BSD-3-Clause | MP4/MOV (progressive) | in-memory file building; not a streaming WebCodecs muxer | active |
| mp4-muxer | 5.2.2, 2025-07-02 | MIT | — | MP4 (streaming, fast start) | **deprecated: "superseded by Mediabunny"** |
| webm-muxer | 5.1.4, 2025-07-02 | MIT | — | WebM | **deprecated: "superseded by Mediabunny"** |
No maintained permissive package reads WebM/Matroska, Ogg, MP3 or FLAC into WebCodecs packets.
Decoding whole audio files with `decodeAudioData` is not an option for long sources: a 3-hour
stereo file is about 4 GB of decoded samples (NFR-05).

D-003: spike permissive options first; if needed, bring an exception for unmodified MPL-2.0.

## Decision
**Recommended (pending SP-license and an explicit owner approval):** use **mediabunny** (DEP-04)
as the only container library, behind MOD-Container, the only module allowed to import it.
Scoped exception to ADR-0001:
- exactly the npm package `mediabunny`, pinned to an exact version and updated deliberately;
  no `@mediabunny/*` extensions (the AAC encoder extension is FFmpeg compiled to WebAssembly,
  excluded by D-003);
- used **unmodified**; if a fix is ever needed, it goes upstream or the exception is reopened
  (modified MPL files would have to be published);
- `/third-party-notices.txt` and the in-tool notices (F-020.R4) carry its MPL-2.0 notice and a link
  to the exact source of the shipped version (the "how to obtain the source" obligation for
  executable form);
- MPL-2.0 is file-level copyleft: our own files stay under the tool's own licence;
- the `dist/` scan (ADR-0001) confirms only the tree-shaken mediabunny code ships and the notice is
  present.

Only the low-level parts are used: `Input` with a `Blob` source and packet sinks to feed our own
`VideoDecoder`/`AudioDecoder`, and `Output` with encoded-packet sources and a streaming target to
write what our own encoders produce. Decoding, encoding, compositing and mixing stay ours, so the
library can be replaced without touching other modules.

**Permissive fallback (if the owner declines):** mp4box.js (DEP-37) to read MP4/MOV; the frozen
mp4-muxer (DEP-38) and webm-muxer (DEP-39), pinned, to write; and our own readers for
WebM/Matroska (EBML), MP3, ADTS, Ogg, FLAC and WAV, plus our own Ogg writer. SP-license sizes this
path; the current estimate is 2–3 weeks of extra work and a permanent maintenance and fixture
burden, with two unmaintained dependencies.

## Alternatives considered
- **Permissive composite (above)** — fully within ADR-0001, but large own surface on exactly the
  parts that break on real files (edit lists, rotation, VFR, damaged files).
- **FFmpeg compiled to WebAssembly** — excluded (D-003), LGPL/GPL, large, needs cross-origin
  isolation for threads (ADR-0003).
- **Reading only MP4/MOV in M-1** — would refuse WebM screen recordings and most audio formats,
  contradicting RULE-01.

## Consequences
- Pending condition: SP-license passes (fixture corpus reads and writes correctly, bundle within
  budget) **and** the owner approves the exception (legal decision). Until then MOD-Container is
  built against an interface that both paths implement.
- If accepted, ADR-0001's dist scan has one named MPL-2.0 runtime exception.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
