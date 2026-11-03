---
id: F-021
title: Work offline
status: ready
milestone: M-1
priority: P2
personas: [PER-01, PER-03]
entities: []
rules: []
screens: [SCR-Editor]
components: []
nfr: [NFR-01, NFR-10]
events: []
depends_on: [F-019]
---

## Intent
The tool needs nothing from a server once loaded, so it should work without a connection (PRN-05).

## Scope
- In: every M-1 feature offline, after one full visit made the same way (embedded or standalone); picking up new versions on a later open.
- Out: background updates.

## Requirements
- **R1** During the first online visit the tool fetches every file it can need, including looks, typefaces and bundled music (NFR-01). After one visit long enough to cache them, made the same way (embedded or standalone), the tool opens and every M-1 feature works with no connection.
- **R2** The tool makes no network requests of its own. It only checks for a new version while the page is being opened.
- **R3** A new version is used from the next open. An open session is never reloaded.

## Acceptance criteria
- **AC1** Given one earlier online visit long enough to cache all files, made the same way (embedded or standalone), when the tool opens offline, then the user can add a video, apply a look, add text and bundled music, and export. (R1)
- **AC2** Given a first online visit, when the network log is inspected, then every request is for the tool's own files, all of them fetched during that visit; and given a later session, using looks, typefaces, music and export for the first time causes no request. (R1, R2)
- **AC3** Given a new version is published while the tool is open, when the user keeps working, then nothing reloads; when the user opens it again online and then once more, then the new version is used. (R3)

## UX notes
No visible UI.

## Edge cases
- A first visit offline → the browser's offline page.
- Opened standalone once, then embedded offline for the first time (or the reverse) → not available offline; browsers keep a separate copy for each way.

## Open questions
