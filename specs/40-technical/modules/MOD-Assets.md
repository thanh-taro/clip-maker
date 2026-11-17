---
id: MOD-Assets
title: Assets — looks, music and the asset manifest from the tool's own origin
status: draft
depends_on: [MOD-Core]
---

## Responsibility
Reads the build-generated asset manifest and loads look tables from the tool's own origin after
first render, so the service worker has them for offline use and no feature fetches on first use
(NFR-01, D-017). Bundled music is read on first use: a track's hashed file, listed in the asset
manifest, is read when it is first auditioned or placed, and the service worker's precache makes
it available offline after the first visit (ADR-0013 §5, build question 113). On the development
server, which builds no manifest, the compiled-in music paths stand in for it; never in a build. The only module allowed to call `fetch`, and only for paths
listed in the manifest. Provides the music catalogue (ENT-MusicTrack: id, title, source, licence,
duration) and the looks catalogue.

## Not responsible for
- Decoding music (MOD-Audio) or applying looks (MOD-Compositor); caching (service worker).

## Public surface
- `looks(decode)` → look ids, groups and table bytes, read once per session from the hashed strips the manifest lists (`LOOK_FILES`), in looks.md order; a look that fails is left out and read again on the next call (`decode` is MOD-Compositor's strip decoder, passed by MOD-App); `musicTracks()` → ENT-MusicTrack list (compiled in from the
  checked pack); `musicBlob(id)` / `musicBytes(id)` → the track's packaged file.

## Implements
F-008 (data), F-011.R1/R6/R7, F-021.R1/R2; RULE-09 (looks set), RULE-12 Bundled music; NFR-01, NFR-10. Decided by ADR-0013, ADR-0014, ADR-0015.
