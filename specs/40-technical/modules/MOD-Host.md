---
id: MOD-Host
title: Host — theme, language, the host contract and the service worker
status: draft
depends_on: [MOD-Core, MOD-Copy]
---

## Responsibility
The suite's host contract: the inline boot script sets theme and language before first paint;
origin- and parent-checked `taro:theme` / `taro:language` messages; one content-free `taro:ready`
(INV-08); never takes focus from the host. Registers the service worker after first render and
reports nothing else (ADR-0015).

### Rules from the spikes (2026-11-04)
Evidence: SP-frame, SP-ios (ADR-0014 outcome).
- The ready signal goes once to the parent origin from `location.ancestorOrigins[0]` or
  `document.referrer`, only if it is in `HOST_ORIGINS`.
- Whether the frame grants web share is detected with `navigator.canShare({ files })`. The portal
  grants `share` to Clip Maker (taro-kit `content/tools/clip-maker.yaml`, commit 4c4ae94); another host
  frame may not, and then Share is hidden.

### Offline cache (F-021; refines ADR-0015, decided 2026-11-10)
ADR-0015's design, with these details (they refine its "prune old assets on navigation"):
- **One cache per version**, `clip-maker-offline-<version>`. The build sets the asset manifest's
  `version` to a hash of its file list and stamps it into `/sw.js`, so any changed file gives the
  browser a new worker.
- **Hash check.** The install stores each manifest file only if its bytes match the manifest hash
  (files unchanged since an older version are reused from that version's cache); the manifest is stored
  last and marks a complete copy. At the end the install re-checks that its cache still exists and is
  complete, or fails and is retried on the next online open. The tool's host must not rewrite HTML or
  scripts (docs/deploy/offline-checks.md).
- **Prune on activate.** Older versions' caches are deleted when a new version activates (after every
  tab of the old one has closed, so at a navigation), and only if the new version's own copy is
  complete.

## Not responsible for
- Strings (MOD-Copy), assets (MOD-Assets).

## Public surface
- `initHost()` → signals `theme`, `language`; `registerOffline()`.
- `canShareFile(file)` → true only when `navigator.share` exists and `navigator.canShare({ files: [file] })` is true (RULE-17 optional web-share grant); F-015 shows Share only then.

## Implements
F-019.R1–R6, F-021.R2/R3, F-022.R1–R3; RULE-17, RULE-18; INV-05, INV-08; NFR-09. Decided by ADR-0002, ADR-0014, ADR-0015.

## Portal tool contract (portal commit 4c4ae94, 2026-11-04)
- **Focus.** After the first `taro:ready`, the portal moves keyboard focus into our frame, but only while focus is still on its tool header. If we want a specific control focused, we do it on the window's first `focus` event, and only when `document.activeElement === document.body`. Never rely on `autofocus`. The control is CMP-EmptyState's Add media in an empty project, and none when the project has content (owner, 2026-11-05). WebKit refuses `focus()` in a cross-origin frame without a user gesture, even in that first `focus` event: there the tool's document has focus (keys reach the tool) but no control is focused until a click or Tab.
- **Downloads.** Always create downloads from `blob:` URLs (`URL.createObjectURL`), never `data:` URLs. Safari checks a frame's `data:` download against the portal's `frame-src` and refuses it.
- **Share.** Call `navigator.share` only inside a user gesture, after `navigator.canShare({ files: [file] })` with the real file. Otherwise offer download only (F-015.R9).
- **Leave-page warning.** It needs the `dialogs` grant, and Safari never shows it from an embedded page (F-018 edge case).
