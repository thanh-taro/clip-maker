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
successful hand-over by the SP-storage rule, on the next export, on New project, on `pagehide`, and
by a sweep at every start (anything left by a closed page). It is the only module allowed to touch
`navigator.storage`.

## Not responsible for
- What is written (MOD-Export, MOD-Container); Cache Storage (service worker).

## Public surface
- `hasRoom(bytes)` → boolean; `create()` → `{ sink, file(), discard() }`; `sweep()`.

## Implements
F-015.R7, F-019.R7; INV-01; NFR-11. Decided by ADR-0010.
