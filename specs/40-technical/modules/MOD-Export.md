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

## Not responsible for
- Storage housekeeping (MOD-Scratch), codec capability (MOD-Codec), the export panel UI (MOD-App).

## Public surface
- `estimate(project, settings)` → `{ bytes, reachable, suggestedResolution?, smallestTargetMB? }`.
- `start(project, settings)` → handle with `progress` events, `cancel()`, and a result `{ ok, fileName } | { error: copyId }`.

## Implements
F-015.R1–R8, F-016.R1–R4, F-019.R7; RULE-15, RULE-16, RULE-19 (signal), D-018, D-020; INV-01, INV-02; NFR-04, NFR-05, NFR-08, NFR-11. Decided by ADR-0010.
