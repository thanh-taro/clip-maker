---
id: MOD-Export
title: Export — video, GIF and audio exports end to end
status: draft
depends_on: [MOD-Core, MOD-Plan, MOD-Container, MOD-Codec, MOD-Engine, MOD-Compositor, MOD-Audio, MOD-Scratch]
---

## Responsibility
Runs an export in a fresh export worker (ADR-0003, ADR-0010): sink choice (scratch file, memory, or
COPY-error.no_space), trial encode, the frame-by-frame picture pipeline and block-wise sound, back-
pressure, progress and time remaining, cancel by terminating the worker, interruption detection,
size-target control with the single corrective pass, the panel's estimate (with the calibration
encode), GIF frames through gifenc (DEP-05) with alternating delays, and the WAV writer. Hands the
finished file to the browser with the RULE-15 file name and reports success so MOD-Project can
mark the export (RULE-19). Locks editing while running.

### Rules from the spikes (2026-11-04)
Evidence: SP-speed, SP-size-target, SP-storage, SP-ios, SP-compositor, SP-audio, SP-gpu-color,
SP-mem-phone (ADR-0010 outcome).
- Two workers per export: the export (video) worker and the export-audio worker, both created idle at
  start-up and terminated on cancel. The muxer accepts audio packets after all video packets without
  holding video in memory.
- Encoder: probe-recorded `latencyMode`; queue cap 4–8; stall watchdog ≥ 20 s with the longest output
  gap recorded; on a real stall re-create the encoder at the next output keyframe and continue.
  Errors are reported as `name: message`.
- Audio packet times are shifted by the measured encoder delay (edit list); explicit colour tags
  (primaries 1, matrix 1, transfer per ADR-0007 outcome, range as produced).
- Estimate: 3 × 2 s calibration (10/50/90 %), key/delta model capped at nominal, delivered AAC rate,
  overhead 4 KB + 0.35 KB/s. Size target: reachable only if bitrate ≥ floor and the target-rate
  pre-check predicts ≤ X; effective floor = max(table floor, delivered rate); corrective pass
  `bitrate × budget ÷ actual × 0.97`; a file still over the target is never handed over.
- Output dimensions even, long side a multiple of 16 (480p = 848 × 480).
- Interruption: wall-clock rules (a) hidden + 5 s without progress, (b) no progress within 3 s of
  becoming visible, (c) encoder/WebGL error after a hide → COPY-error.export_interrupted, shown at
  detection, clean-up behind it; an export alive on return continues.
- Hand-over by `<a download>` (no fresh activation needed); MOD-Scratch's 10 s rule follows. Share
  (where RULE-17's grant and the device allow) only after the G3 spec change.

### GIF and audio only (F-016 build, 2026-11-19)
- GIF settings carry the range's end (`to`); the GIF covers `from` to the earlier of `to`, the project's
  end and 15 s later.
- The panel's GIF estimate encodes the frames at 10, 50 and 90 % of the range on their own in the idle
  export worker (the calibration request) and multiplies their mean size by the frame count, plus the
  fixed parts.
- The GIF loop yields to the worker's event loop at least every 50 ms, so `export:abort` is handled (scratch
  closed and deleted) before the worker is terminated; nothing else in that loop waits on another task.
- The capability record exists even when no video format works (`videoFormat` null): GIF and WAV need no
  video or sound encoder and stay available (F-023.R5).

## Not responsible for
- Storage housekeeping (MOD-Scratch), codec capability (MOD-Codec), the export panel UI (MOD-App).

## Public surface
- `estimate(project, settings)` → `{ bytes, reachable, suggestedResolution?, smallestTargetMB? }`.
- `start(project, settings)` → handle with `progress` events, `cancel()`, and a result `{ ok, fileName } | { error: copyId }`.

## Implements
F-015.R1–R8, F-016.R1–R4, F-019.R7; RULE-15, RULE-16, RULE-19 (signal), D-018, D-020; INV-01, INV-02; NFR-04, NFR-05, NFR-08, NFR-11. Decided by ADR-0010.
