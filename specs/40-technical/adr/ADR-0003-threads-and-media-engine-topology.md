---
id: ADR-0003
title: Threads — UI on the main thread, media in dedicated workers, sound through an audio worklet; no cross-origin isolation
status: accepted
date: 2026-11-03
supersedes: []
---

## Context
Preview must hold 30 fps (24 on the phone) with every effect on while the UI stays responsive and
scrubbing answers within 150 ms (NFR-03). Sound must never stutter. Export must reach 1× real time
on the laptop (NFR-04) and cancel within 1 s (NFR-11). Phones have little memory (NFR-05, D-002).
Preview and export must produce the same picture and sound (INV-02, NFR-08), which is easiest when
both run the same code. Multithreaded WebAssembly or `SharedArrayBuffer` would need cross-origin
isolation (COOP + COEP on the tool **and** on the portal page, plus a frame grant), which would
change the host contract (RULE-17) and the portal's own headers (its COEP is deliberately unset).

## Decision
1. **Main thread**: Preact chrome, MOD-Project (document and history), MOD-Timeline and
   MOD-Preview overlays and input, MOD-Keys, MOD-Host, MOD-Copy, MOD-Assets, the text rasteriser
   (ADR-0012), and the `AudioContext` with its worklet node.
2. **Engine worker** (one dedicated module worker): MOD-Container reads, MOD-Codec decoders,
   MOD-Engine scheduling and frame cache, and MOD-Compositor drawing into the preview canvas, which
   the main thread hands over once with `transferControlToOffscreen()`. Decoded frames never cross
   a thread. The main thread sends ticks (wanted project time from the audio clock), project
   snapshots and text bitmaps; the worker answers with "frame shown at t" and errors.
3. **Audio worker** (one dedicated module worker): decodes sound windows, resamples, stretches and
   mixes (ADR-0008), and streams 48 kHz stereo blocks to an `AudioWorkletProcessor` through a
   transferred `MessagePort` (no shared memory). The worklet only plays queued blocks and reports
   the position; the `AudioContext` clock is the master clock of playback.
4. **Analysis worker** (one dedicated module worker, low priority): probes new files (RULE-01,
   RULE-02), and makes media-panel thumbnails, timeline thumbnails and waveform peaks.
5. **Export worker** (created per export, terminated after it): runs the same MOD-Container,
   MOD-Codec, MOD-Compositor and MOD-Audio code on an unattached `OffscreenCanvas` at output size,
   encodes and muxes into a sink (ADR-0010). Cancel = `worker.terminate()` plus scratch cleanup, so
   NFR-11's 1 s holds even if a codec call hangs. While it runs the editor is locked (F-015 edge
   case) and the engine and audio workers release their decoders and caches to give it memory.
6. **No `SharedArrayBuffer`, no threaded WebAssembly, no COOP/COEP isolation.** The tool keeps
   `Cross-Origin-Opener-Policy: same-origin` like the suite and sets no COEP. RULE-17's frame
   grants do not change. Encoding threads are the browser's own (WebCodecs runs codecs off the
   calling thread), which is where the parallelism comes from.
7. **Fallback** if SP-compositor shows that a browser cannot run WebGL2 or decoders in a worker
   with `OffscreenCanvas` well enough: the engine runs on the main thread with the same modules
   (they import no thread-specific API other than through a small host adapter).

## Alternatives considered
- **Everything on the main thread** — simplest, but decode callbacks, GL uploads and UI compete;
  phones would miss NFR-03. Kept only as the fallback in 7.
- **Shared-memory ring buffers (needs cross-origin isolation)** — lower audio latency, but changes
  the portal's headers and the host contract for a gain we do not need: playback latency of
  ~100–200 ms is invisible because the picture follows the audio clock.
- **FFmpeg or another codec compiled to WebAssembly with threads** — rejected by D-003 and by the
  isolation cost.
- **One worker for everything media** — a GL stall would starve the audio mix; separate audio
  worker keeps sound smooth on slow GPUs.

## Consequences
- Four dedicated workers plus a worklet; every file is a hashed same-origin module (CSP
  `worker-src 'self'`, worklet under `script-src 'self'`).
- Messages are typed and versioned in MOD-Core; transferables (`VideoFrame`, `ImageBitmap`,
  `ArrayBuffer`) avoid copies.
- The portal and RULE-17 are unaffected; SP-frame confirms every piece works inside the frame.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->

## Outcome (spikes, 2026-11-04)
Evidence: SP-frame, SP-compositor, SP-speed, SP-ios (`.build-my-app/reports/spike-*.md`).
- **Confirmed, no isolation needed.** Module workers, WebGL2 on a transferred and on an unattached
  `OffscreenCanvas` (incl. half-float targets and 33³ 3D textures), WebCodecs, `AudioWorklet` fed
  over a transferred `MessagePort`, OPFS sync handles and `<a download>` all work standalone,
  embedded same-site and embedded cross-site, with `crossOriginIsolated === false`, in Chromium,
  Chrome, WebKit (automated), Safari 27, Firefox 158 and iPhone Safari 27 (owner). 0 unexpected CSP
  violations. The §7 main-thread fallback is not needed on any tested engine; it stays documented.
- **One worker one paint holds**: 720/720 export frames at offset 0 against the preview path, A/V
  +0.04 ms with zero drift over 10 min (all engines) and over 3 min on the iPhone.
- **Rule change — export uses two workers.** SP-speed showed that decoding the clips' sound in the
  same pass as the video decoders makes the audio the critical path (Chrome 23.4 s vs 17.8 s for the
  NFR-04 fixture under load) and that a serial audio pass first is far slower in WebKit (111 s vs
  44 s). An export therefore runs an **export (video) worker** and an **export-audio worker**, both
  created idle at start-up (no request on first export) and both terminated on cancel. The
  export-audio worker decodes the clips' sound first (before the video loop starts), then mixes,
  limits, encodes and verifies (ADR-0008) while the video encodes. Packets meet in the muxer in the
  export worker.
- **Rule change — WebGL context loss** (SP-ios: after a 60 s lock iOS restarted the GPU process and
  the next export's new context was lost at frame 1). Every worker that owns a WebGL2 context
  handles `webglcontextlost`/`webglcontextrestored` (ADR-0006 §9).
- iPhone has no page full screen (`requestFullscreen` absent); the maximise-in-page fallback of
  F-002.R7 applies. Downloads without transient activation (end of a long export) work in every
  engine with the `downloads` grant.
