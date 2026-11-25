---
id: MOD-Build
title: Build — code generation, asset packing, headers, manifests and release gates
status: draft
depends_on: []
---

## Responsibility
Generates the copy catalog and token CSS, converts `.cube` looks to PNG tables with identity
checks, writes `asset-manifest.json` for the service
worker, `_headers` from `HOST_ORIGINS` per environment, and `third-party-notices.txt` from
`dependencies.md`; runs the size, licence and dist gates, lint, types, unit, e2e, axe and
Lighthouse in `scripts/release-build` (no code-host workflows).

## Not responsible for
- Deploying (the owner, by hand, phase 7).

## Public surface
- Scripts: `gen-copy`, `gen-tokens`, `gen-looks`, `gen-asset-manifest`, `gen-headers`, `gen-notices`, `check:size`, `check:licenses`, `release-build`.

## Implements
F-020.R4 (notices), F-021.R1 (manifest); NFR-01, NFR-02, NFR-09, NFR-10. Decided by ADR-0001, ADR-0014, ADR-0015, ADR-0016.
