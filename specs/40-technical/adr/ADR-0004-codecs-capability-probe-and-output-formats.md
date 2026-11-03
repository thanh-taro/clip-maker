---
id: ADR-0004
title: Browser codecs, a start-up capability probe, and the output format fallback order
status: proposed
date: 2026-11-03
supersedes: []
---

## Context
RULE-01 accepts MP4/MOV and WebM/Matroska video "the device can decode", RULE-15 wants MP4 with
H.264 and AAC "when the device can encode them, otherwise the first format in the fallback order
set in `40-technical`", RULE-16 wants AAC in M4A or a fallback for audio-only, and RULE-22 wants a
start-up check of decode, encode and effects. Codec support differs by engine and device:
the Gecko desktop engine has no AAC encoder in its codec API; the Gecko Android browser has no
codec API at all; HEVC decode depends on hardware and OS; Android encoders can claim support for a
configuration and then fail. D-003: no FFmpeg compiled to WebAssembly; only the browser's own codecs.

## Decision
1. **WebCodecs only**: `VideoDecoder`, `VideoEncoder`, `AudioDecoder`, `AudioEncoder`. No
   `<video>`/`MediaRecorder` paths (they cannot give frame-exact, offline-speed results, INV-02).
   Photos decode with `createImageBitmap` (`imageOrientation: 'from-image'`), as in the suite.
2. **Capability probe at start (RULE-22, F-023)**, in the engine worker, before media is accepted:
   - decode: `VideoDecoder.isConfigSupported` for H.264 (Baseline/Main/High), HEVC, VP8, VP9 and
     AV1 configs at 1080p and 2160p; at least one must pass (else COPY-unsupported.missing_decode);
   - encode: `VideoEncoder.isConfigSupported` per candidate video codec at each RULE-15 size and
     each project frame rate, and `AudioEncoder.isConfigSupported` for AAC-LC and Opus at 48 kHz
     stereo; at least one complete video output format must pass (else missing_encode);
   - effects: a WebGL2 context with the features of ADR-0006 must be creatable (else
     missing_effects), then a short timed render of the full effect chain at 1080p decides the
     slow-device notice (threshold below);
   - per source, the real `VideoDecoderConfig` from the container is checked again on add
     (COPY-reason.codec if refused), and the first frames are actually decoded during probing.
   The whole probe must finish inside NFR-02's budget; it never makes a request.
3. **Output fallback order (RULE-15, video)**, first one whose video and (if the project has sound)
   audio encoders both pass:
   1. MP4 · H.264 + AAC-LC (preferred).
   2. MP4 · H.264 + Opus (Gecko desktop today).
   3. WebM · VP9 + Opus.
   4. WebM · VP8 + Opus.
   A project without sound uses the first format whose video encoder passes and writes no audio
   track. The chosen format is named by COPY-export.format_note when it is not the first.
4. **Audio-only fallback (RULE-16)**: AAC-LC in M4A; otherwise Opus in Ogg (`.ogg`); WAV is our own
   writer and always available.
5. **Encode settings**: hardware preferred (`hardwareAcceleration: 'no-preference'`, retry with
   `'prefer-software'` on failure), `latencyMode: 'quality'`, a keyframe at least every 2 s,
   H.264 High profile where supported else Main, AAC 128 kbps / Opus 128 kbps stereo 48 kHz in
   video files, 192 kbps / 160 kbps for audio-only. Bitrates per resolution and quality are in
   `architecture.md` ("Export tables"); rate control is ADR-0010.
6. **Trial encode**: an export encodes its first frame before showing progress; if the encoder
   errors despite the probe, that format is dropped for the session and the next one in the order is
   offered (PRN-07, RULE-22 "only that item is left out").
7. **Slow-device threshold (RULE-22)**: the timed render of the complete chain (look, all
   adjustments, cross-fade of two 1080p textures, blur background, three text bitmaps) must reach
   24 frames per second equivalent; below that, COPY-notice.slow_device. Final number tuned by
   SP-gpu-color.

## Alternatives considered
- **WebM VP9 + Opus before MP4 + Opus on Gecko** — WebM plays in browsers but is refused by many
  phone galleries and upload flows; MP4 with H.264 picture is the most widely accepted container,
  and Opus in MP4 plays in all three browser engines and common desktop players. Owner to confirm
  (open question in the proposal).
- **Own or WebAssembly AAC encoder** — excluded by D-003, and codec patents would become ours.
- **`MediaRecorder` for export** — real-time only, not frame-exact, and its output differs per
  engine; fails NFR-04 and NFR-08.

## Consequences
- Every engine has a defined output or a clear refusal (SP-codec builds the matrix).
- The export panel's options come from the probe results, never from browser sniffing.
- The Gecko Android browser is "unsupported" by RULE-22 until its codec API ships.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
