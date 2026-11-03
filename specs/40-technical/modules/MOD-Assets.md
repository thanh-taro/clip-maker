---
id: MOD-Assets
title: Assets — looks, music and the asset manifest from the tool's own origin
status: draft
depends_on: [MOD-Core]
---

## Responsibility
Reads the build-generated asset manifest and loads look tables and bundled music from the tool's
own origin after first render, so the service worker has them for offline use and no feature
fetches on first use (NFR-01, D-017). The only module allowed to call `fetch`, and only for paths
listed in the manifest. Provides the music catalogue (ENT-MusicTrack: id, title, source, licence,
duration) and the looks catalogue.

## Not responsible for
- Decoding music (MOD-Audio) or applying looks (MOD-Compositor); caching (service worker).

## Public surface
- `looks()` → look ids, groups and table bytes; `musicTracks()` → ENT-MusicTrack list; `musicBytes(id)`.

## Implements
F-008 (data), F-011.R1/R6/R7, F-021.R1/R2; RULE-09 (looks set), RULE-12 Bundled music; NFR-01, NFR-10. Decided by ADR-0013, ADR-0014, ADR-0015.
