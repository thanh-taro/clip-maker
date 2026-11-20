# QA — security and privacy audit (phase 5)

Date: 2026-11-20 · Scope: the whole app at `main` (3e7b87b) · Method: static read of the source, the
build scripts, the generated headers, and the existing `dist/`. The `dist/` was built 2026-11-19 23:36
and no file under `src/`, `scripts/` or `public/` has changed since, so it matches HEAD. Per the machine
rule, nothing was run: no e2e, no `pnpm check`, no build, no dev server.

Checked against: NFR-01 (privacy and network), NFR-09 (security, RULE-17), INV-01, INV-08, PRN-01,
ADR-0014 (hosting and CSP), ADR-0015 (offline), ADR-0010 (scratch).

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 4 |
| Info | 7 |

There are no exploitable findings. The four low findings are about the release and deploy process:
they guard against a misconfigured build or host. They are not defects in the runtime code. There is no
regression in the F-015 export path: the `blob:` hand-over still has `rel=noopener`, the hold is still
10 s, and the share-hold release (earlier finding L1) is still in place at `src/app/export.ts:953`.

---

## Findings

### L1 — Nothing in the release checks that the build's host allow-list is the production one
- **Where:** `vite.config.ts:29` (the `__HOST_ORIGINS__` value is read from the shell environment at
  build time), `scripts/gen-headers.mjs` `hostOrigins()`, `.env.example:10` (it shows a localhost value
  as an example), and `docs/deploy/release-checklist.md:6-13` (no step checks the allow-list).
- **Scenario:** The owner runs the release build from a shell where `HOST_ORIGINS` still holds a local
  test value, such as `https://tarokit.app http://localhost:4290`. `pnpm build` writes that list into
  `frame-ancestors` and into the runtime message allow-list, and no step notices. The shipped tool then
  accepts being framed by, and settings messages from, `http://localhost:4290`. A local page on that
  port could embed the tool. It could then use the tool for UI-redress tricks or send theme and
  language messages. The impact is low because those messages carry only theme and language. Still,
  this breaks RULE-17 ("Allowed origins are fixed at deployment").
- **Fix:** Add a step to `check:release` (or a new `check:headers --release`). It should fail unless
  `dist/_headers` `frame-ancestors` and the compiled `HOST_ORIGINS` array in `dist/assets/index-*.js`
  both equal the production list (`https://tarokit.app`). It should also check that
  `Access-Control-Allow-Origin` equals the production `TOOL_ORIGIN`. Add this to the release
  checklist.

### L2 — The dist scan checks licences but not network behaviour
- **Where:** `scripts/check-dist.mjs:63-146`.
- **Scenario:** NFR-01 is enforced today by the source lint ban (`eslint.config.js`), the CSP, and the
  e2e request log. None of these looks at the shipped bytes for network code. `mediabunny` (MPL, it
  ships) has a `UrlSource` that calls `fetch`. Today it is tree-shaken out. I checked: the only
  `fetch(` in `dist/` is MOD-Assets in `index-*.js` plus `sw.js`, and the other matches are a
  `prefetch` method. A later dependency bump or import could bring in a network path such as `fetch`,
  `sendBeacon`, `WebSocket` or `importScripts` from third-party code that the lint never sees. The CSP
  would still block cross-origin requests. However, a same-origin beacon or a new dependency's
  telemetry would only be caught if an e2e test happened to use that feature.
- **Fix:** Extend `scanDist` with a code check on the shipped `.js` files and `sw.js`:
  - Fail on `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `importScripts`,
    `WebAssembly`, `RTCPeerConnection`, `eval(` and `new Function`.
  - Allow `fetch(` only in the main chunk (MOD-Assets) and `sw.js`.
  - Allow absolute `http(s)://` literals only from a short list. Today's list: the w3.org
    namespaces, the codec-registry and mozilla.org licence comments, `https://tarokit.app`, and
    `https://github.com/thanh-taro/clip-maker`.

### L3 — No check that the deployed host actually serves the generated security headers
- **Where:** `docs/deploy/offline-checks.md` "Staging smoke check" and
  `docs/deploy/release-checklist.md` step 3. Both check the service worker's cache but not the
  response headers.
- **Scenario:** Cloudflare can serve `dist/` while ignoring or overriding `_headers`. Three ways this
  can happen: the file is excluded from the upload, a zone Transform Rule or Managed Transform drops
  or replaces headers, or the staging environment is set up without it. The tool keeps working. But
  `frame-ancestors`, the CSP (including `connect-src 'self'`) and the Permissions-Policy would all be
  gone. That silently removes the NFR-09 protections and the CSP layer of NFR-01. Today nothing would
  notice. The e2e suite runs only against `vite preview`, which re-applies `_headers` itself
  (`scripts/lib/preview-headers.mjs`).
- **Fix:** Add a step to the staging and production smoke checks: `curl -sI` on `/`, `/sw.js` and one
  `/assets/*.js`, then compare the result with `dist/_headers` using `headersFor()`. Look especially at
  `Content-Security-Policy`, `Permissions-Policy`, `Referrer-Policy` and
  `Access-Control-Allow-Origin`. In the phase 7 Cloudflare checklist, also confirm these zone features
  are off for the subdomain: Web Analytics automatic setup (RUM injection), Zaraz, Rocket Loader, Email
  Obfuscation, and Bot Fight / JS challenges. `offline-checks.md` already asks for no rewriting; this
  step makes it something you check.

### L4 — Trusted Types is not enforced in the CSP
- **Where:** `scripts/gen-headers.mjs:66` (`pageCsp`).
- **Scenario:** The rule "user text is never markup" (NFR-09) depends on two things: the lint ban on
  `innerHTML` and `dangerouslySetInnerHTML` (`eslint.config.js:85-87`), and the fact that Preact,
  canvas `fillText` and `textContent` only ever render text. I confirmed all user strings go through
  these paths: source file names, text items, the pasted `text/plain`, and refusal reasons. The
  bundle still contains Preact's `dangerouslySetInnerHTML` → `innerHTML` path. If a later dependency,
  or code the lint does not cover, sends a user-controlled string to an HTML sink, nothing at runtime
  stops it.
- **Fix:** Add `require-trusted-types-for 'script'; trusted-types 'none'` to the page CSP. Chromium and
  WebKit 26+ enforce it, and other engines ignore it. Run the existing e2e suite once to confirm that
  nothing in Preact's normal render path uses an HTML sink. Its `innerHTML = ''` reset is a plain
  string assignment, so test it. If it is blocked, allow a `default` policy that only permits empty
  strings. This is an owner decision because it changes ADR-0014's header set, so it needs a short
  superseding note.

### I1 — Logs: raw exception objects go to the console
- **Where:** `src/media/intake.ts:109`, `src/media/analysis.worker.ts:30`, `src/app/adding.ts:198`.
- **Note:** Exceptions from the demuxer or decoder may contain details about the source file. They
  appear only in the local devtools console; nothing is sent anywhere, and no telemetry or reporting
  endpoint exists (the CSP has no `report-to`). This does not conflict with PRN-01. Optionally, log
  only `e.name` in production builds.

### I2 — Permissions-Policy could also deny the ad and attribution features
- **Where:** `scripts/gen-headers.mjs:90-117`.
- **Note:** The tool runs no third-party code, so these features are unreachable. For defence in depth,
  and to match "no analytics", you could add `attribution-reporting=()`, `run-ad-auction=()`,
  `join-ad-interest-group=()`, `private-aggregation=()`, `shared-storage=()`,
  `shared-storage-select-url=()`, `compute-pressure=()`, `encrypted-media=()`,
  `picture-in-picture=()`.

### I3 — Some scratch can be left behind, as the spec allows
- **Where:** `src/scratch/index.ts:390-434`, `:442-476`.
- **Note:** If the page closes during an export, or within the 10 s hand-over hold, an export or spill
  file containing the user's exported video stays in OPFS. It is removed the next time the tool opens
  in the same storage partition (embedded and standalone are swept separately in WebKit). INV-01 and
  COPY-privacy.details state this exactly, so it matches the spec. The safeguards hold:
  - OPFS is used only while this session holds its Web Lock (`src/export/index.ts:525`). Without Web
    Locks the export uses memory, so nothing can be stranded where no sweep would ever run.
  - Only `export-<session>-<random>.part` names are opened or deleted (`src/scratch/index.ts:153`).

### I4 — `randomId` has a small modulo bias
- **Where:** `src/scratch/index.ts:30-32` (`b % 36`).
- **Note:** The id is used only for uniqueness (lock and file names), never as a secret, so the bias
  has no security impact. Optionally, use rejection sampling.

### I5 — No `Cross-Origin-Resource-Policy` on `/assets/*`
- **Note:** Other sites can hot-link the public fonts, looks and music. This exposes no user data.
  Optionally, add `Cross-Origin-Resource-Policy: same-origin` on `/assets/*`. It does not affect the
  portal frame, because navigations are exempt. Check it on iOS together with the worklet CORS header
  (ADR-0014 outcome).

### I6 — A dev server exposed on the LAN serves the whole repository
- **Where:** `docs/local-dev.md:33-36`.
- **Note:** For phone testing, `pnpm dev --host` with mkcert serves the source tree and Vite's dev
  endpoints to the whole LAN. Prefer `pnpm build && pnpm preview --host` (dist only, real headers) on
  shared networks, and stop the server after each session.

### I7 — Per-environment settings for phase 7
- **Note:** Staging needs `TOOL_ORIGIN=https://clip-maker-staging.tarokit.app` (otherwise iOS
  standalone refuses the worklet: the ACAO header would name production), the staging `HOST_ORIGINS`
  (empty means `frame-ancestors 'none'`), and the `X-Robots-Tag: noindex` from ADR-0014.
  `gen-headers.mjs` has no environment switch for the robots header yet. Covered by L1 and L3 once
  those checks exist.

---

## Verified controls (no finding)

- **Host contract (RULE-17, INV-08, F-019):**
  - `src/host/messages.ts:29-41` accepts settings only when `event.origin` is in the compiled
    allow-list **and** `event.source === window.parent`. It accepts only `taro:theme` (`light`/`dark`)
    and `taro:language` (a matched supported value).
  - `src/host/index.ts:105-106` posts `READY_MESSAGE` (frozen, `{type:'taro:ready'}`) once, to an
    exact origin and never to `'*'`, and only when that origin is allowed. A disallowed
    `ancestorOrigins[0]` does not fall back to the referrer.
  - The lint bans `postMessage` on `parent`, `top` and `opener` outside MOD-Host.
  - The only `window` message listener is in MOD-Host. All other `postMessage` and `onmessage` use
    is with dedicated workers, the worklet port, or MessageChannels the page created itself.
- **Embedding (NFR-09):** `frame-ancestors https://tarokit.app`. `normaliseOrigin` refuses wildcards,
  keywords, paths, `null` and non-https origins (except localhost). `headersRules` checks the values
  again. COOP `same-origin` cuts the opener for standalone use. Double framing is blocked because
  `frame-ancestors` checks every ancestor.
- **CSP (ADR-0014):** `dist/_headers` matches the ADR:
  - `default-src 'none'`, scripts limited to self plus the boot hash, `connect-src 'self'`.
  - No `unsafe-*`, no `wasm-unsafe-eval`, no `blob:`, `base-uri` and `form-action` set to `'none'`.
  - The inline script in `dist/index.html` is the hashed boot script, and there are no inline styles.
  - `/sw.js` has its own minimal CSP.
- **Network (NFR-01):**
  - `fetch` exists only in MOD-Assets and `sw.js`. Source lint enforces this, and I confirmed it in
    `dist/`.
  - MOD-Assets uses only GET, sends no body, and fetches only manifest-listed root-relative paths with
    no `?`, `#`, `\` or `//` (`src/assets/index.ts:21-25`).
  - The service worker routes and stores only own-origin GETs (`offline-policy.ts:111-123`) and checks
    every precached file against its SHA-256 (`sw.ts:76`).
  - The dist bundles contain no `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`,
    `importScripts`, `eval`, `new Function` or `WebAssembly`, and there are no external URLs besides
    namespaces, licence comments, the allow-list origin and the GitHub link.
  - `specs/50-quality/analytics.yaml` defines no events.
- **Storage:**
  - Cookies, `localStorage`, `sessionStorage` and IndexedDB are not used anywhere in the source or in
    `dist/`.
  - Only MOD-Scratch can use `navigator.storage` and OPFS (lint-enforced).
  - The project, media, history and settings stay in memory. Language and theme are never stored
    (RULE-18).
- **User text and markup:** User strings render only as JSX text, `textContent`, `title` or canvas
  `fillText`. Pasting reads only `text/plain`. `marked()` splits trusted COPY strings on private-use
  markers and inserts the values as text.
- **Media input:** Every file is limited before decoding: 4 GB, 100 sources, 3 h, and caps on video
  and photo pixels (RULE-02, `src/core/limits.ts`). Large photos are decoded scaled down. Probing runs
  in a worker, and a failure becomes a refusal, never a hang.
- **External link:** GitHub opens with `target=_blank rel="noopener noreferrer"`, and
  `Referrer-Policy: no-referrer` applies globally.
- **Downloads:** The export name contains no project or source data (`clip-YYYYMMDD-HHMMSS.ext`,
  `src/core/export.ts:211`). Raw error text never reaches the UI.
- **Secrets:** None are tracked.
  - `.env` and `.env.*` are git-ignored, and `.env.example` holds only non-secret defaults and empty
    Cloudflare variables.
  - `wrangler.jsonc` holds no account ID or token. It sets `workers_dev: false`,
    `preview_urls: false` and `not_found_handling: none`.
  - Source maps and `.vite` are excluded from the upload (`public/.assetsignore`), and no shipped JS
    has a `sourceMappingURL` comment.
- **Supply chain:** `pnpm-workspace.yaml` enables `minimumReleaseAge`, `trustPolicy: no-downgrade`,
  `blockExoticSubdeps` and `strictDepBuilds` (no lifecycle scripts). All versions are pinned exactly.
  There are 10 runtime dependencies: Preact, signals, mediabunny, gifenc, fontsource and lucide-static.
  None of them makes network calls in the shipped code (checked in `dist/`).
- **Permissions:** The tool requests no runtime permission prompts: no camera, microphone, location,
  clipboard or notifications. The Permissions-Policy denies them explicitly. Full screen and web share
  are allowed for `self` only, and the host frame must delegate them. Share is used only after
  `canShare` and inside a user gesture.

---

## Privacy declaration (draft)

Owner to confirm the hosting log settings at deploy (marked ⚑).

### Store / catalogue form answers (App Store "App Privacy" and Google Play "Data safety" shape)

| Question | Answer |
|---|---|
| Does the tool collect any data? | **No.** No data is collected, transmitted to the developer, or shared with third parties. |
| Data used to track the user | **None.** No identifiers, no cookies, no fingerprinting, no advertising. |
| Data linked to the user | **None.** |
| Data not linked to the user | **None.** |
| Analytics / crash reporting / diagnostics | **None.** No analytics, no crash or error reporting, no CSP reporting endpoint. |
| Third-party SDKs that collect data | **None.** The libraries that ship are Preact, @preact/signals, mediabunny, gifenc, Fontsource typefaces and Lucide icons. All run locally and make no network requests. |
| Account / sign-in | None. |
| Is data encrypted in transit? | Yes. Only the tool's own files are transferred, over HTTPS with HSTS. No user data is transferred. |
| Can users request data deletion? | Not applicable, because nothing is collected. Data stored on the device is listed below and is removed automatically or by clearing site data in the browser. |
| Data types (Photos/Videos, Audio, Files and docs, User content) | **Processed on device only, never collected.** The media the user opens, the project, text items and exports stay in the browser. |
| Permissions requested | None. Files are opened only through the user's own file picker, drag-and-drop or paste. |

### Storage the tool uses on the device

| Storage | What | Contains user data? | Lifetime |
|---|---|---|---|
| Memory (page) | The project, opened media, preview, undo history, theme and language | Yes | Gone when the page closes. Nothing is kept between sessions (PRN-01). |
| Origin-private file system (OPFS), folder `clip-maker-scratch/` | Temporary export files `export-<session>-<random>.part` (the file being written, plus a spill file of encoded video waiting for its sound) | Yes: the exported video or audio while it is being built | Deleted when the export fails or is cancelled. After a success, deleted 10 s after the browser takes the file. If the page closes first, deleted the next time Clip Maker opens in the same browser context. Used only for exports. |
| Web Locks | One lock name per open tab, `clipmaker-scratch:<random>` | No | Released when the tab closes |
| Cache Storage (service worker), `clip-maker-offline-<version>` | An offline copy of the tool's own files: page, scripts, styles, typefaces, looks, bundled music and licence notices (about 12 MB) | No | Replaced when a new version takes over; otherwise kept until the browser evicts it or the user clears site data |
| Cookies, localStorage, sessionStorage, IndexedDB | Not used | — | — |

When embedded in the TaroKit portal, some browsers (WebKit) keep separate storage for the embedded and
standalone tool. Each is cleaned up separately.

### Network activity

- **Requests:** `GET` requests to the tool's own origin (`https://clip-maker.tarokit.app`) for its own
  files. On the first online visit it fetches everything it can need. Later opens make only the
  browser's version check of the page and `/sw.js`. No request carries media, project content or user
  data, and the CSP blocks connections to any other origin.
- **Hosting:** The tool is static files on Cloudflare. Like any website, the host's servers receive
  standard request metadata: IP address, user agent, time and the requested path. The tool does not
  collect or use this metadata. ⚑ Owner: confirm the Cloudflare account has no Web Analytics, Zaraz,
  Logpush or other log retention for this subdomain, and state Cloudflare's standard log retention in
  the public privacy notice if one is published.
- **Host portal:** When embedded, the tool receives only theme and language from the portal and sends
  exactly one message, `taro:ready`, with no content.
- **User-initiated only:**
  - **Download** saves the export to the device with a name like `clip-20261120-143005.mp4`.
  - **Share** hands the exported file to the operating system's share sheet. The user chooses where
    it goes, and the tool sees nothing afterwards.
  - **Source code on GitHub** opens github.com in a new tab with no referrer. GitHub's own privacy
    policy applies there.

### Short public notice (EN; for the catalogue entry)

> Clip Maker runs entirely in your browser. Your videos, photos, music and projects never leave your
> device: nothing is uploaded, and there are no accounts, analytics, ads or trackers. The first visit
> downloads the tool's own files (looks, fonts and music, about 12 MB) so it works offline. During an
> export it may use temporary space on your device, which is deleted when the export ends, or the next
> time you open Clip Maker if the page closed during an export. Nothing about your project is kept
> after you close the page.
