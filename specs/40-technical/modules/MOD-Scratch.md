---
id: MOD-Scratch
title: Scratch — the only on-device storage, used during export only
status: draft
depends_on: []
---

## Responsibility
Owns one directory in the origin-private file system. Checks free space for an export, creates
the export's scratch file and its synchronous access handle in the export worker, exposes the
finished file for saving, and deletes it per ADR-0010: on failure or cancel at once, after a
successful hand-over by the SP-storage rule, on the next export, on New project, best effort on `pagehide`, and
by a sweep at every start (anything left by a closed page). It is the only module allowed to touch
`navigator.storage`.

### Rules from the spikes (2026-11-04)
Evidence: SP-storage, SP-frame, SP-ios, SP-mem-phone (ADR-0010 outcome item 6).
- Names `scratch/export-<session>-<random>.part`; this session holds the Web Lock
  `clipmaker-scratch:<session>` for the page's life.
- Failed/cancelled: close the handle, delete at once. Success: nothing revoked or deleted for 10 s
  after the download click, then revoke and delete. Next export / New project: delete this session's
  files whose 10 s are up. `pagehide`: best effort only.
- Start-up sweep: delete another session's file only inside a granted `locks.request(…, {
  ifAvailable: true })` for that session; skip files whose delete throws; no heartbeats; no sweep
  without `navigator.locks`.
- `hasRoom(bytes)` uses `quota − usage ≥ bytes` (usage may include a same-site tab's scratch in
  Chrome; the WebKit frame has 1/10 of the standalone quota). Writes go out in ≥ 1 MB batches.

## Not responsible for
- What is written (MOD-Export, MOD-Container); Cache Storage (service worker).

## Public surface
- `hasRoom(bytes)` → boolean; `create()` → `{ sink, file(), discard(), handedOver(at) }`; `sweep()` (holds the session lock).

## Implements
F-015.R7, F-019.R7; INV-01; NFR-11. Decided by ADR-0010.
