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

## Outcome (spikes, 2026-11-04)
Evidence: SP-speed, SP-storage, SP-size-target, SP-ios, SP-frame, SP-compositor, SP-audio,
SP-gpu-color, SP-mem-phone (automated on the MacBook; owner runs on iPhone 14 Pro Safari 27.0.1,
Safari 27 macOS, Firefox 158).

**Measured:**
- **NFR-04 fixture** (60 s, 1080 × 1920, full chain, music, verify-and-trim): Chrome median 20.0 s
  (16.3 s on a quieter host, 3.0–3.7× real time); WebKit 44.1 s (37.3 s quieter, 1.4–1.6×);
  **iPhone 34.4 s (1.74×)** — all inside 75 s / 150 s. 10-min 1080p export: Chrome 6.85×, WebKit
  2.82×. Software-only H.264: 0.8× (laptop). Output correct in every run.
- **Where time goes**: Chrome is encoder-bound; WebKit is CPU-bound (`VideoFrame(canvas)` ≈ 8 ms,
  decoder flushes); iPhone spends 21.7 of 34 s wrapping canvases. Decoding clip sound concurrently
  with the video decoders made the audio pass the critical path in Chrome.
- **Scratch**: sync-handle writes 700–5000 MB/s with 1 MB chunks (2–4× slower with 64 KB); NFR-04
  writes ≈ 10 MB/s. Quota: Chrome ≈ 10 GB in every context (same-site frame **shares** storage and
  quota with standalone); WebKit frame quota is **1/10** of standalone (1 966 vs 19 661 MB on the
  Mac). Save integrity: 0 failures at ≥ 250 ms after the click on 3 engines (132 cases); WebKit lost
  6/22 saves when the file was deleted 3–79 ms after the click (2 silently: no download at all).
  `pagehide` deletion never completed (16/16). Web Locks sweep: 48/48 leftovers removed, 0 live
  files touched; the heartbeat scheme deleted a live file. Playwright WebKit sometimes cannot open a
  sync handle ("unknown transient reason") and its ephemeral context has no OPFS.
- **Interruption (iOS)**: lock 10/60 s, app switch and tab switch interrupted every export
  (frames 621–731 of 1800); project intact and scratch empty every time; message 3.05–3.17 s after
  return, clean-up done by 4.7–5.0 s (simulated on Mac; owner saw the message on the iPhone).
  Control Centre does not hide the page. A worker still alive on return carries on.
- **iOS encoder pauses**: in a 10-min export the H.264 encoder stopped draining for > 4 s with no
  error (spike watchdog fired at 270 s); whether it is a pause or a stop is pending the re-run.
- **Rate control**: VBR hits nominal within 0.1–0.8 % except screen content (2–6× under);
  3 × 1 s calibration is up to 61 % off, **3 × 2 s capped at nominal ≤ 6.0 % (Chrome) / 13.9 %
  (WebKit; 3.3 % with the measured AAC rate)**. CBR delivers 100.0–100.8 % when reachable, but
  encoders have **content-dependent minimum rates** (high motion: Chrome ≈ 633/1 358/2 642 kbps,
  WebKit ≈ 809/1 658/3 136 kbps at 480/720/1080) and ignore lower requests; the corrective pass
  cannot fix that. A target-rate pre-check predicted pass 1 within −7.3 % to +10.9 % and flagged
  every overshooting row (0 misses in 84). Container overhead measured ≈ 4 KB + 0.35 KB/s.
  Chrome resamples frames whose width is not a multiple of 16 (854 × 480 → luma PSNR 22 dB).

**Rule changes:**
1. **§1 pipeline schedule**: the export worker runs plan → decode → paint → `VideoFrame(canvas)` →
   encode → mux; the export-audio worker (ADR-0003 outcome) decodes the clips' sound **before** the
   video loop starts, then runs mix → limiter → encode → verify-and-trim (ADR-0008 outcome item 2)
   alongside the video. The muxer must accept audio packets that arrive after all video packets
   without holding encoded video in memory: the build verifies a streaming layout that allows this
   (mediabunny MP4 with the index written at the end or reserved, or fragmented MP4) in its first
   export integration test; holding video in memory until audio arrives is not allowed.
   Encoded audio (≈ 14 MB for 10 min) may be held until muxed.
2. **Encoder handling**: `latencyMode` per the probe record (quality, or realtime where the trial
   needed it; ADR-0004 outcome item 6); queue cap 4–8. A **stall watchdog of ≥ 20 s** (not 4 s)
   with the longest gap between encoder outputs recorded; on a real stall (no output for 20 s
   while visible) the encoder is closed, re-created and restarted at the next keyframe boundary of
   the output, and the export continues. Errors are reported as `name: message` (WebKit's `stack`
   omits the message).
3. **Priming**: audio packet times are shifted by the encoder delay measured by the trial encode so
   the container writes an edit list (ADR-0008 outcome item 3); input edit lists are honoured.
4. **Colour tags**: MOD-Export passes explicit colour tags to the writer (ADR-0007 outcome item 2).
5. **§2 sinks**: scratch file when OPFS is available and `quota − usage ≥ estimate × 1.3` (in Chrome
   `usage` includes another same-site tab's scratch; in the WebKit frame the quota is 1/10 of
   standalone, so COPY-error.no_space is a real path there). Memory sink otherwise, under the device
   cap. The muxer's sink writes in **≥ 1 MB batches**. Automated WebKit tests that cannot open a
   sync handle use a null (byte-counting) sink; iOS Safari streams to OPFS (owner run).
6. **§3 scratch lifecycle** (MOD-Scratch; replaces "on `pagehide`" and "a short delay"):
   - names are session-unique: `scratch/export-<session>-<random>.part`;
   - **failed or cancelled**: close the sync handle, then delete at once (deleting with the handle
     open fails with `NoModificationAllowedError` everywhere);
   - **success**: after the `<a download>` click, revoke nothing and delete nothing for **10 s**,
     then revoke the URL and delete the file (10 s ≈ 40× the largest unsafe delay seen);
   - **next export or New project**: delete this session's earlier files whose 10 s are up; a
     younger file keeps its timer;
   - **`pagehide`**: start deleting files whose 10 s are up, best effort only (it never completes);
   - **start-up sweep**: take this session's exclusive Web Lock `clipmaker-scratch:<session>` for
     the page's life; for each `export-<sid>-*.part` with another `sid`, request that session's lock
     with `ifAvailable: true` and delete only inside a granted callback; skip files whose delete
     throws and names that are not ours; no timestamps or heartbeats; without `navigator.locks`, no
     sweep. Heartbeats are rejected.
   This needs the F-015.R7 / INV-01 / F-015.AC7 wording change proposed at G3 (scratch of a page
   closed within the 10 s is removed at the next open, not at page close).
7. **§5 size target**: video bitrate formula and the 0.95 factor kept (VBR-fallback engines and
   Firefox unmeasured); the "1 % + 512 kbit" overhead term is kept as **headroom**, not as an
   estimate (measured overhead is ≈ 25× smaller). A target is reachable at a resolution only if
   (a) the computed video bitrate ≥ that resolution's floor **and** (b) a **pre-check** — the
   3 × 2 s calibration encoded at the target's constant bitrate — predicts a file ≤ X × 1,000,000
   bytes. The effective floor is therefore max(table floor, the encoder's measured delivered rate
   on this project). The smallest whole-MB target at 480 (D-020) uses that effective floor. The
   corrective pass uses `bitrate × budget ÷ actual × 0.97`; if the file is still above the target
   after it, it is never handed over and the export fails per F-015.R6 (not observed in 80 rows).
8. **§6 estimate**: calibration = 3 ranges × **2 s** (one GOP each) at 10/50/90 % of the project,
   encoded as one contiguous stream with a keyframe at each range start; video size =
   key-mean × keyframes + delta-mean × other frames, **capped at nominal**; audio at the probe's
   delivered AAC rate; overhead 4 KB + 0.35 KB/s. Cost ≈ 0.4–1 s at 1080 on the laptop (4 s worst
   under load). Quality levels stay VBR.
9. **§4 / architecture.md export tables**: output dimensions are even and the long side is a
   multiple of 16 — 480p is **848 × 480 / 480 × 848** (not 854). Floors 300/600/1,000 kbps
   (480/720/1080) stay **pending the owner's visual check** of the committed stills; 1440/2160 are
   untested.
10. **§8 interruption** (replaces "hidden and no progress for 5 s"): with wall-clock time
    (`Date.now`), the export fails with COPY-error.export_interrupted when (a) the page is hidden and
    no progress is made for 5 s (engines whose timers run hidden), or (b) **after the page becomes
    visible again, no new progress arrives within 3 s**, or (c) an encoder or WebGL error follows a
    hide. Without a hide, an error gives COPY-error.export_failed. The message is shown at
    detection; abort, worker termination (after 1.5 s without an answer) and scratch deletion run
    behind it. An export still alive on return simply continues. A page discarded while hidden
    leaves its scratch to the next start's sweep; nothing is stored to show a message after a reload
    (D-004).
11. **Save and share**: the end-of-export `<a download>` needs no fresh user activation in any
    engine (tested 6 s and ≈ 60 s after the tap). On iPhone every format lands in Files after a
    prompt; Photos is reached only through the share sheet (`navigator.share({ files })`), which
    works standalone and, embedded, only with the frame's `web-share` grant (portal change request;
    RULE-17 optional grant). Offering Share needs the F-015 spec change proposed at G3; while Share
    is offered, the scratch file is kept until the export panel closes (then the 10 s rule applies),
    because sharing reads the `File` later than the download does.
12. GIF (§10) and WAV (§11) are unchanged; GIF encoding with gifenc (DEP-05) was not exercised by a
    spike (SP-ios used a minimal stand-in writer) and is verified in the build.
