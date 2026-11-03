---
id: ADR-0014
title: Hosting, security headers (connect-src limited to our own origin) and the local / staging / production environments
status: proposed
date: 2026-11-03
supersedes: []
---

## Context
The suite hosts each tool as static files on Cloudflare static assets at its own subdomain, with a
strict CSP including `connect-src 'none'` and `frame-ancestors <host origins>`, deployed by hand
(image-annotator ADR 0010; portal `tool-contract.md`). Clip Maker differs in three ways:
1. It must read its own binary assets — 16 look tables and ≈ 10 MB of music — as bytes at start-up
   (ADR-0013). Fonts, images and scripts have their own CSP directives, but reading bytes needs
   `fetch`, which `connect-src 'none'` refuses. The portal's contract explicitly allows "only the
   tool's own origin for its own static files".
2. Codec behaviour can only be trusted on real phones over real HTTPS (codec APIs need a secure
   context; phones cannot reach a laptop's `localhost`).
3. It needs no cross-origin isolation (ADR-0003), so the frame contract (RULE-17) is unchanged.

## Decision
**Hosting**: Cloudflare static assets via wrangler (DEP-31), assets only, no Worker script,
`workers_dev: false`, preview URLs off, deployed by hand by the owner in phase 7 only.

**Headers** (generated `_headers`, from `HOST_ORIGINS`):
```
Content-Security-Policy: default-src 'none'; script-src 'self' '<boot-hash>'; style-src 'self';
  img-src 'self' data:; font-src 'self'; worker-src 'self'; connect-src 'self';
  media-src 'none'; manifest-src 'none'; frame-src 'none'; object-src 'none';
  base-uri 'none'; form-action 'none'; frame-ancestors <HOST_ORIGINS or 'none'>
Permissions-Policy: fullscreen=(self), clipboard-read=(), clipboard-write=(), camera=(),
  microphone=(), geolocation=(), display-capture=(), usb=(), …(suite list)
Referrer-Policy: no-referrer · X-Content-Type-Options: nosniff
Cross-Origin-Opener-Policy: same-origin · (no COEP, no CORP needed)
Strict-Transport-Security: max-age=31536000; includeSubDomains
Cache-Control: no-cache for HTML, the manifest and sw.js; immutable for hashed /assets/*
/sw.js → Content-Security-Policy: default-src 'none'; connect-src 'self'
```
- **`connect-src 'self'` instead of the suite's `'none'`** (owner decision): `fetch` is used only by
  MOD-Assets, only for paths in the build-generated asset manifest (no query strings, no bodies,
  GET only), enforced by the lint ban (ADR-0002), a unit test on MOD-Assets and the e2e request
  log (NFR-01: only the tool's own files, all on the first visit). The NFR-01 e2e still proves
  that a `fetch` to another origin is refused by the CSP.
- No `'wasm-unsafe-eval'` (ADR-0008 fallback would add it by a superseding ADR). No `blob:` in
  any source list: downloads navigate a `blob:` link, which needs none; the preview never uses
  media elements (`media-src 'none'`).
- `fullscreen=(self)` lets the host's `allow="fullscreen"` delegate it (F-002.R7).

**Host contract** (RULE-17, ADR-0002): unchanged from the suite. The portal catalog entry declares
`downloads`, `dialogs`, `fullscreen`, and optionally `popups` for the source link (F-020.R3).
Known engine behaviour from the suite's frame findings applies: the leave-page warning is never
shown from a cross-origin frame in the WebKit engine (F-018 edge case), and storage in a frame is
partitioned from standalone use.

**Environments**
| Environment | Where | Serves | `HOST_ORIGINS` | Purpose |
|---|---|---|---|---|
| local dev | Vite dev server on `localhost`; optional LAN HTTPS with a locally trusted certificate (mkcert, DEP-33) for phones; Android also via USB port forwarding to `localhost` | source, hot reload, fake host page | `http(s)://localhost:<stub port>` | development, spikes on phones |
| local release preview | the exact `dist/` with the generated headers on a local static server, plus a stub host page on another local origin | release build | as production plus the stub | e2e, Lighthouse, frame tests |
| staging | Cloudflare static assets, second wrangler environment, `https://clip-maker-staging.tarokit.app` (one-level subdomain so the existing certificate covers it), `X-Robots-Tag: noindex` | release candidate | the portal's staging origin if it exists, else empty (standalone only) | real-device codec, download and offline checks over real HTTPS and CDN headers before production |
| production | `https://clip-maker.tarokit.app` | approved release | `https://tarokit.app` | users |
Nothing (project, DNS, tokens) is provisioned before phase 7, and only with the owner's approval.
Staging deploys are by hand like production; both keep the previous version for instant rollback.

## Alternatives considered
- **Keep `connect-src 'none'`** and smuggle bytes through other directives (music encoded into PNG
  pixels, data in script files, a service-worker message channel) — keeps the stronger header but
  is fragile and unusual; the portal contract already allows own-origin fetches.
- **No staging (the suite's M-1 choice)** — fine for an image tool; for video, phone codec and
  download behaviour must be seen on real HTTPS before users do. The owner may still decline;
  then LAN HTTPS covers the spikes and the release check runs against production after deploy.
- **Cross-origin isolation for threads** — not needed (ADR-0003).

## Consequences
- One deliberate difference from the suite's header set, documented and tested.
- A staging hostname and a second wrangler environment in phase 7 (free tier).
- Phone testing during development needs a trusted local certificate or USB forwarding, never a
  public tunnel (CLAUDE.md: local only).

<!-- Accepted ADRs are immutable. Write a new ADR to change a decision. -->
