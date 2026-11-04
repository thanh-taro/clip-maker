---
id: ADR-0015
title: Offline — the suite's hand-written service worker, precaching a build manifest of every file
status: accepted
date: 2026-11-03
supersedes: []
---

## Context
F-021: after one online visit (made the same way, embedded or standalone) every M-1 feature works
offline; the first visit fetches everything the tool can need, including looks, typefaces and
music (NFR-01, D-017); the tool makes no requests of its own except the version check while
opening; a new version is used from the next open; an open session is never reloaded. The suite
uses a hand-written service worker seeded with the URLs the page loaded (image-annotator ADR 0011),
which works because that tool loads everything at start. Clip Maker also loads all code at start,
but its music (10 MB) is fetched after the editor is usable (NFR-02), so "what loaded" is not a
safe seed.

## Decision
Reuse the suite's worker design (network-first page matched ignoring the query; cache-first hashed
assets; no `skipWaiting` or `clients.claim` mid-session; prune old assets on navigation; Cache
Storage is the only storage the worker uses) with one change: the build writes
`asset-manifest.json` listing **every** file the tool can need (HTML, scripts, worker and worklet
modules, CSS, fonts, look tables, music, notices) with hashes. After first render MOD-Host registers
`sw.js`; the worker's `install` precaches the whole manifest from our own origin (its CSP is
`connect-src 'self'`); MOD-Assets reads looks and music through the same URLs, served from the
cache. The tool shows nothing about this; a failed precache is retried on the next online open. The cache holds only the tool's own files (INV-01).

## Alternatives considered
- **Seed from loaded resources (the suite's way)** — would miss music not yet read when seeding
  runs.
- **A service-worker framework** — more than a fixed same-origin list needs.

## Consequences
- First visit downloads ≈ 12 MB in the background; storage use is visible in the browser's
  site data only as the tool's own files.
- Embedded and standalone keep separate caches (partitioned storage), as F-021.R1 already says.

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
