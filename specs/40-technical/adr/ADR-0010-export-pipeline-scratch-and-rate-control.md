---
id: ADR-0010
title: Export — streaming pipeline in a worker, scratch file in the origin-private file system only during export, bitrate tables and size-target control, GIF and WAV
status: proposed
date: 2026-11-03
supersedes: []
---

## Context
F-015 and F-016: video, GIF and audio exports with progress, time remaining (AC12), cancel within
1 s (NFR-11), a size estimate within ±25 % (F-015.AC11), a size target never exceeded
(F-015.AC10) with per-resolution bitrate floors set here (RULE-15), clean failure (F-015.R6),
interruption when the page is hidden (F-015 edge case), no metadata, the RULE-15 file name, and
"success = handed to the browser to save" (D-018). A 10-minute 2160p export at Best is about
2.7 GB; holding that in memory on a phone is not possible, so the output needs on-device scratch
space during export only, deleted afterwards and swept on the next open (D-004, INV-01,
F-015.R7, AC14). In the portal frame, storage is partitioned and may be small (F-019.R7).

## Decision
1. **Pipeline (export worker, ADR-0003)**: for each output frame k: MOD-Plan → MOD-Engine's
   sequential decode (no seeking except at clip starts) → `paint` at output size → `VideoFrame` →
   `VideoEncoder`; audio in parallel: MOD-Audio `render` in 1 s blocks → `AudioEncoder` (or the WAV
   writer); packets → MOD-Container's muxer → sink. Back-pressure on `encodeQueueSize` and the
   sink's write queue keeps memory flat. The worker never uses `requestAnimationFrame` or timers
   for pacing, so a hidden page does not slow it on engines that keep workers running.
2. **Sinks** (chosen at start, in order):
   1. **Scratch file** when the origin-private file system is available and
      `navigator.storage.estimate()` leaves room for the estimate × 1.3: a file
      `scratch/export-<random>.part` written through a synchronous access handle in the export
      worker; MP4 is written with its index reserved up front (exact frame and packet counts are
      known), so no second copy is needed.
   2. **Memory** (`Blob` assembled from chunks) when there is no scratch space but the estimate
      × 1.3 is under the device cap (phone 300 MB, laptop 1.5 GB).
   3. Otherwise refuse before starting with COPY-error.no_space (F-015 edge case, F-019.R7).
   Saving: `URL.createObjectURL(file or blob)` and a click on `<a download="clip-…">`; that is
   success (RULE-15, D-018: a cancelled save dialog is not detectable on this path).
3. **Scratch lifecycle (INV-01)**: MOD-Scratch owns one directory. It deletes the export's file
   when the export fails or is cancelled (immediately), and after a success once the save has been
   handed over and the browser has had time to read it (the exact rule comes from SP-storage: an
   event if any engine offers one, otherwise a short delay), and in every case on the next export,
   on New project, on `pagehide`, and at every start of the tool (sweep of anything left by a
   closed page, F-015.AC14). Nothing else is ever written there.
4. **Bitrates**: the quality levels map to per-resolution bitrates and the floors in
   `architecture.md` ("Export tables"), scaled by frame rate (60 fps × 1.5; 24/25 fps × 0.85).
   Quality levels use variable bitrate; a size target uses constant bitrate where the encoder
   supports it (else variable with a larger margin).
5. **Size target (RULE-15, D-020)**: video bitrate = (X × 8,000,000 × 0.95 − audio bits −
   container overhead) ÷ duration. The target is reachable at a resolution if that bitrate ≥ the
   resolution's floor; the panel offers the largest reachable resolution, or the smallest whole-MB
   target 480 can reach. After muxing, if the file is above X × 1,000,000 bytes (rare), the export
   re-encodes once at a proportionally lower bitrate before saving, with progress continuing; the
   saved file is never above the target (F-015.AC10).
6. **Estimate (F-015.AC11)**: bitrate × duration + audio + overhead. Because variable bitrate
   undershoots on simple content (screen recordings), the panel refines the estimate with a short
   calibration encode of up to 3 sampled seconds at the chosen settings when it opens (in the
   export worker, cancellable). If SP-size-target cannot meet ±25 % this way, quality levels also
   switch to constant bitrate.
7. **Progress and time remaining**: frames muxed ÷ total frames (plus a final step for index
   writing), monotone, posted at least every 500 ms; time remaining from a moving average once
   10 % is done (F-015.AC12).
8. **Interruption**: if the page becomes hidden and the worker or encoders stop making progress
   for 5 s, or an encoder reports an error after `visibilitychange`, the export fails with
   COPY-error.export_interrupted; the project is untouched; scratch is deleted. Engines that keep
   working in the background simply continue. SP-ios measures what iOS does.
9. **Metadata (RULE-15)**: no creation times (zeroed where the format has the field), no names,
   no location or device tags, no encoder tags beyond fields the format makes mandatory.
10. **GIF (RULE-16)**: frames from `paint` at GIF size, quantised per frame to 256 colours and
    encoded by gifenc (DEP-05), looping forever; frame delays in hundredths of a second alternate
    (e.g. 7, 7, 6 at 15 fps) so every frame stays within one GIF frame of its preview time
    (NFR-08). Bytes go to the same sinks.
11. **WAV (RULE-16)**: our own RIFF writer, 16-bit PCM, 48 kHz stereo, from the same mixer
    render (ADR-0008), rounded with a fixed-seed triangular dither so repeated exports are
    identical.
12. **File name** from local time when the export finished (RULE-15), computed in MOD-Core.

## Alternatives considered
- **Always in memory** — simplest, fails NFR-05 for long or high-resolution exports on phones.
- **Write straight to a user-chosen file (`showSaveFilePicker`)** — no scratch at all and a
  detectable cancel, but only in one engine family, not in cross-origin frames, needs a fresh user
  gesture (so it would have to happen before the export, which conflicts with RULE-15's
  finish-time file name); a later improvement, not M-1.
- **IndexedDB as scratch** — slower for large sequential writes and banned by the suite's lint.
- **Two-pass encoding for every size target** — doubles time against NFR-04; one corrective pass
  only when needed.

## Consequences
- Pending: SP-storage (scratch in and out of the frame, deletion timing, quota), SP-ios (hidden
  page, downloads), SP-size-target (estimate accuracy, overshoot), SP-speed (throughput).
- Scratch use is a documented exception to "nothing is stored" that F-020.R2's explanation names.
- INV-01's wording "deleted when its export ends" needs a clarification for the success case
  (proposal, spec issue S-1).

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
