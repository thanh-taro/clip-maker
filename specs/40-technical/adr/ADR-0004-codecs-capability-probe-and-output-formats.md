---
id: ADR-0004
title: Browser codecs, a start-up capability probe, and the output format fallback order
status: accepted
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

## Outcome (spikes, 2026-11-04)
Evidence: SP-codec (automated + owner runs on iPhone 14 Pro Safari 27.0.1, Safari 27.0.1 macOS,
Firefox 158), SP-compositor, SP-audio, SP-speed, SP-size-target, SP-hdr.

**Measured output per engine (RULE-15 order holds; D-033 confirms Gecko):**
| Engine | Video with sound | Audio only | Notes |
|---|---|---|---|
| Chrome 156 (macOS) | MP4 · H.264 + AAC | M4A AAC | H.264 hardware; 75/75 trial encodes pass |
| Playwright Chromium 156 (macOS) | MP4 · H.264 + AAC | M4A AAC | software H.264 (openh264); no HEVC decode |
| Safari 27 (macOS) | MP4 · H.264 + AAC, **realtime mode only** | M4A AAC | `latencyMode:'quality'` H.264 never emits a chunk; `'realtime'` runs at 3.9× real time at 1080p30 |
| iPhone 14 Pro, Safari 27 | MP4 · H.264 + AAC at every size and rate | M4A AAC | 2160p60 encodes at 0.49× real time |
| Firefox 158 (macOS) | MP4 · H.264 + Opus (D-033) | Ogg Opus | no AAC encoder; VP8/VP9 software only |

**Rule changes:**
1. **Start-up probe = minimal set** (replaces the full grid of §2): decode configs at 1080p,
   one encode probe per candidate codec at 1080p30, AAC-LC and Opus encode, WebGL2 + effects check.
   Measured 32–54 ms on every real engine (212 ms cold in headless Chrome); budget ≤ 300 ms.
   The full grid (20 decode + 60 encode) took 1.1–1.8 s and is **not** run at start.
2. **Size × rate grid probed lazily** when the export panel opens, only for the codec the fallback
   order chose (≈ 20 calls, 100–400 ms). RULE-15's "offered only when the device can encode it" is
   decided there.
3. **Concurrency cap 4** for `isConfigSupported` calls. Unbounded parallel encoder probes crashed
   the renderer in Chromium and Chrome (twice the 60-config grid).
4. **AAC description normalisation**: an AAC `decoderConfig.description` that starts with tag
   `0x03` (WebKit returns a 39-byte ES_Descriptor) is reduced to its 2-byte AudioSpecificConfig
   (tag `0x05` payload) before muxing and before any self-check. Without it WebKit falls back to Opus
   needlessly.
5. **`isConfigSupported` is not proof.** A source is accepted only after its first packets really
   decode (§2 already says so). Known false positives: WebKit FLAC decode (every packet fails,
   incl. iPhone) → such FLAC files get COPY-reason.codec there; a Chromium FLAC `dfLa` description
   that `configure` rejects.
6. **Trial encode (§6) extended**:
   - encode with `latencyMode:'quality'`; if no chunk arrives within **2 s**, retry with
     `'realtime'` and record the working mode per engine in the capability record (Safari macOS
     needs realtime). Every export of the session uses the recorded mode;
   - measure the **encoder delay** with an impulse round trip instead of assuming it (AAC measured
     2112 samples in every engine, Opus pre-skip 312) and hand it to MOD-Export (edit list,
     ADR-0010);
   - record whether the H.264 encoder is hardware or software, the supported `bitrateMode`s
     (constant and variable everywhere tested; quantizer Chrome only) and the **delivered AAC
     rate** (WebKit ignores `bitrate`: ≈ 98 kbps on dense audio, 68–89 kbps measured on fixtures).
7. **Encode settings (§5)** kept: `hardwareAcceleration:'no-preference'` (retry
   `'prefer-software'` on failure), `latencyMode:'quality'` (realtime only per item 6), encoder
   queue cap 4–8 (2/8/16 measured, no gain beyond 8). Software-only H.264 runs at ≈ 0.8× real time
   at 1080p on the M3, so NFR-04 cannot hold there; the export estimate states the slower time.
8. **Opus rules**: never use WebKit's Opus encoder for export (decodes to +3 to +4 dBTP, SNR 3.5 dB);
   WebKit always has AAC. No Opus below 128 kbps in exports.
9. **Slow-device threshold (§7, RULE-22)** replaced: the start-up effects check renders the full
   RULE-08 chain + a look + Blur at 1080p on a generated bitmap, 5 warm-up + 30 timed frames with one
   GPU sync at the end (0.1–1 s). **Below 30 fps (> 33 ms per frame) → COPY-notice.slow_device.**
   Measured pairs: check ≥ 33 fps always played ≥ 24 fps; 13–17 fps played 21 fps; SwiftShader
   2.4 fps played 4.2 fps. iPhone 14 Pro: check 128–140 fps, playback 29.9 fps. Additionally, a
   source that decodes slower than real time on this device is classed "slow" (MOD-Engine); showing
   the notice for it needs the RULE-22 spec change proposed at G3.
10. **HDR frames**: the probe records whether decoded HDR frames are opaque (`format: null`, macOS
    Chrome and WebKit) or already tone-mapped to SDR by the decoder (iOS); see ADR-0007.

**Remaining:** Android Chrome untested (D-037); size-target accuracy of Safari's realtime mode to be
re-checked in QA; HEVC 4K decoder concurrency on iOS (ADR-0009).
