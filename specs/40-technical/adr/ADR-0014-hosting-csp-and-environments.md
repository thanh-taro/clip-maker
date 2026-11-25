---
id: ADR-0014
title: Hosting, security headers (connect-src limited to our own origin) and the local / staging / production environments
status: accepted
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
  base-uri 'none'; form-action 'none'; frame-ancestors <HOST_ORIGINS or 'none'>;
  require-trusted-types-for 'script'; trusted-types clip-maker   (amended 2026-11-20, QA-3)
Permissions-Policy: fullscreen=(self), clipboard-read=(), clipboard-write=(), camera=(),
  microphone=(), geolocation=(), display-capture=(), usb=(), …(suite list), and the ad,
  attribution and cross-site storage features denied (amended 2026-11-20, qa-security I2)
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

## Outcome (spikes, 2026-11-04)
Evidence: SP-frame (automated + Safari 27, Firefox 158, iPhone Safari 27), SP-ios, SP-storage;
owner decisions D-032, D-035, D-036.
- **Headers confirmed.** Under this CSP (`connect-src 'self'`, no `'wasm-unsafe-eval'`), workers,
  the worklet, WebGL2, WebCodecs, OPFS and downloads work standalone and embedded (same-site and
  cross-site) with no COEP; the only violations logged were the deliberate probes (a cross-origin
  `fetch`, and `WebAssembly.compile`). **D-032**: `connect-src 'self'` approved by the owner;
  WebAssembly stays disallowed (a new decision is needed to add it).
- **Rule change — worklet CORS.** iPhone Safari standalone refused the same-origin worklet module
  over CORS (embedded passed). `_headers` serves the worklet module (and, for symmetry, the worker
  modules) with `Access-Control-Allow-Origin: <tool origin>`; re-checked on iOS in QA.
- **Rule change — web share.** `Permissions-Policy` gains `web-share=(self)` so a host's
  `allow="web-share"` can delegate it. The portal change request
  (`.build-my-app/reports/portal-change-request.md`) adds a `share` permission and Clip Maker's
  catalog entry (`downloads`, `file-pick`, `dialogs`, `fullscreen`, `share`); until the portal
  ships it, embedded users get download only (RULE-17). Assumption A5 changes accordingly.
- **Ready signal**: posted once, to the parent's origin taken from `location.ancestorOrigins[0]`
  (Chromium, WebKit) or `document.referrer` (Firefox; the portal sends
  `referrerpolicy="strict-origin"`), only if that origin is in `HOST_ORIGINS`.
- **Storage in the frame**: in Chrome the production shape (`tarokit.app` → `clip-maker.tarokit.app`,
  same site) **shares** OPFS, quota and Web Locks between embedded and standalone; WebKit keeps them
  separate and gives the frame 1/10 of the standalone quota. ADR-0010's outcome handles both.
- **Environments**: **D-036** — staging `clip-maker-staging.tarokit.app` on the free tier is
  planned, created only in the deploy phase. Phone testing uses mkcert certificates over the LAN
  (DEP-33), never tunnels; this worked for every owner run.
- Known noise: WebKit logged many "Refused to apply a stylesheet … style-src" console messages on a
  spike page without inline styles (likely UA styles for `<details>`/`<select>`); re-check in the
  build, no functional effect seen.

## Amendment (QA, 2026-11-20)
Owner decision QA-3 (`.build-my-app/reports/qa-decisions.md`), after qa-security L4; built in QA batch 2.
- **Trusted Types.** The page CSP adds `require-trusted-types-for 'script'` and
  `trusted-types clip-maker`. Every script sink needs a trusted value, and only one policy may be
  created: `clip-maker` (MOD-Core `scriptUrl`), which makes script URLs only, and only for the tool's own
  origin (the five dedicated workers and the offline worker's registration; never `blob:`, `data:` or
  another origin). There is no HTML or script policy, so an HTML sink given a string, `eval` or a string
  timer always throws. The inline boot script is unaffected (allowed by its hash). The audio worklet's
  `addModule` is not a Trusted Types sink. Engines without Trusted Types ignore both directives.
- **Permissions-Policy** also denies `attribution-reporting`, `run-ad-auction`,
  `join-ad-interest-group`, `private-aggregation`, `shared-storage`, `shared-storage-select-url`,
  `compute-pressure`, `encrypted-media` and `picture-in-picture` (qa-security I2; nothing in the tool
  uses them).
- **Release check** (qa-security L1): `pnpm check:release` fails unless `dist/_headers` has
  `frame-ancestors` exactly the production `HOST_ORIGINS` (`https://tarokit.app`), the Trusted Types
  directives above and `Access-Control-Allow-Origin` exactly the production tool origin, and the origins
  compiled into the main chunk are exactly the production list (`scripts/check-release-headers.mjs`).
- **Dist scan** (qa-security L2): `scripts/check-dist.mjs` fails on network primitives in shipped code
  (`XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `importScripts`, `RTCPeerConnection`,
  `WebAssembly`, `eval`, `new Function`), on `fetch(` outside the main chunk and `sw.js`, and on absolute
  http(s) URLs outside a short allow-list (namespaces, licence and codec-registry comments, the portal
  origin, the source repository and the bundled tracks' pages).

## Amendment (deploy, 2026-11-25)
Owner decision D-051 replaces D-036's planned staging environment: there is **no separate staging host**.
The approved release candidate is deployed straight to production (`https://clip-maker.tarokit.app`)
with wrangler (DEP-31, run as `pnpm dlx wrangler@4.157.0` so the candidate's lockfile is unchanged), and
the smoke checks run against production. The checks staging was for (real HTTPS and CDN headers, offline
install, no foreign requests) run there right after the upload; on a failure the previous version is
restored with wrangler's rollback. The `env.staging` block in `wrangler.jsonc` stays unused, and the
staging `X-Robots-Tag: noindex` rule now applies only to local and test builds.

