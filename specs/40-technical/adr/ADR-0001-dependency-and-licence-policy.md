---
id: ADR-0001
title: Dependency and licence policy (the suite's policy, unchanged)
status: proposed
date: 2026-11-03
supersedes: []
---

## Context
Clip Maker is a zero-budget personal tool in the TaroKit suite, by the same owner as the portal and
the sibling tools. It ships JavaScript, fonts, colour data and music to every visitor, and runs
inside the portal's frame. Every runtime dependency is an attack surface for INV-01 and NFR-01 (a
library that phones home, logs or persists breaks PRN-01) and a cost against NFR-10. The suite
already has one machine-checkable policy (image-annotator ADR 0001, accepted 2026-11-02); using it
keeps one audit approach. A video editor needs more third-party code than an image tool (container
reading and writing, a GIF encoder), so the policy's exception mechanism matters more here. The
owner decided (D-003) that a muxer under MPL-2.0 needs an explicit exception after permissive
options are tried, and that no FFmpeg build compiled to WebAssembly is shipped.

## Decision
Adopt the suite policy unchanged:
1. **Allowed for anything, including shipped code and assets**: MIT, ISC, BSD-2-Clause,
   BSD-3-Clause, 0BSD, Apache-2.0, Unlicense, CC0-1.0, BlueOak-1.0.0, Python-2.0; OFL-1.1 for fonts;
   the owner's own work (looks, tokens, fixtures).
2. **Allowed for build/dev/test tools only, unmodified and never shipped**: MPL-2.0, LGPL prebuilt
   binaries, CC-BY-4.0 data.
3. **Never allowed**: GPL, AGPL, SSPL, BUSL or other source-available licences, CC-BY-NC/ND/SA for
   assets, no licence, unknown licence. For music specifically, only CC0 or an equivalent public
   domain dedication (D-010); "royalty-free with an account" licences are excluded.
4. **Exceptions are ADRs.** A shipped package outside list 1 needs its own ADR naming the exact
   package, the versions, the conditions (unmodified, notices, source offer) and an owner approval.
   ADR-0005 is the only candidate exception (MPL-2.0, container library), pending SP-license.
5. **Registry first**: every direct dependency, every transitive runtime dependency, every asset
   pack and every music track is a row in `dependencies.md` before it enters the lockfile or the
   repository. Status moves `proposed` → `approved` → (`removed`); the licence audit approves rows.
6. **Runtime dependencies must** run fully offline, make no request, collect no telemetry, work
   under the CSP of ADR-0014, load at startup (no lazy chunks), and be justified against the size
   budget in `architecture.md`. WebAssembly is not allowed at runtime unless an ADR adds
   `'wasm-unsafe-eval'` to the CSP (ADR-0008 names the only candidate).
7. **Local enforcement** (no code-host workflows): `pnpm licenses list --json` checked against the
   allow-lists by the kind recorded in the registry; a scan of `dist/` fails on third-party code,
   fonts, colour data or audio not registered as runtime/asset; the build writes
   `/third-party-notices.txt`, which the tool also shows inside itself (F-020.R4), including every
   music track's title, source and licence.
8. **Supply chain**: the lockfile is committed; pnpm's block on lifecycle scripts stays on;
   `minimumReleaseAge` delays new releases; updates are reviewed, never auto-merged.

## Alternatives considered
- **A stricter permissive-only policy with no exception path** — would force several thousand lines
  of own container code (see ADR-0005) for no privacy gain; still possible if the owner rejects
  ADR-0005.
- **No registry, audit only** — loses the "why is this here" record, and music tracks need a
  per-item provenance record anyway.

## Consequences
- One policy and one audit across the suite; this tool adds two kinds of row (music tracks, colour
  data) that the siblings do not have.
- Any shipped non-permissive code is visible as its own ADR and needs the owner.
- Codec patents: the tool uses only the browser's own encoders and decoders, so no codec
  implementation is shipped (vision brief; D-003).

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
