---
id: MOD-Assets
title: Assets — looks and the asset manifest from the tool's own origin
status: draft
depends_on: [MOD-Core]
---

## Responsibility
Reads the build-generated asset manifest and loads look tables from the tool's own origin after
first render, so the service worker has them for offline use and no feature fetches on first use
(NFR-01, D-017). The only module allowed to call `fetch`, and only for paths listed in the
manifest. Provides the looks catalogue. There is no music catalogue: the tool ships no music
(D-052, ADR-0013 amendment).

## Not responsible for
- Applying looks (MOD-Compositor); caching (service worker).

## Public surface
- `looks(decode)` → look ids, groups and table bytes, read once per session from the hashed strips the manifest lists (`LOOK_FILES`), in looks.md order; a look that fails is left out and read again on the next call (`decode` is MOD-Compositor's strip decoder, passed by MOD-App);

## Implements
F-008 (data), F-021.R1/R2; RULE-09 (looks set); NFR-01, NFR-10. Decided by ADR-0013, ADR-0014, ADR-0015.
