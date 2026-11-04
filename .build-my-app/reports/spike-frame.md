# Spike SP-frame

**Question.** Do module workers, `OffscreenCanvas` WebGL2, `AudioWorklet`, WebCodecs, OPFS sync
access handles, `<a download>` and full screen all work inside the portal's sandboxed frame under
our CSP (ADR-0014, D-032)? Does anything need COOP/COEP (cross-origin isolation)?

**Hypothesis.**
- Everything works embedded exactly as standalone. The portal's frame keeps `allow-scripts` and
  `allow-same-origin`, so the frame has a real origin, storage and workers. WebCodecs, WebGL2 and
  worklets need a secure context, not isolation.
- Our CSP allows all of it: `worker-src 'self'` covers module workers, `script-src 'self'` covers
  the worklet module, and none of these features needs `connect-src`.
- Downloads need `allow-downloads`; full screen needs `allow="fullscreen"` plus the tool's
  `fullscreen=(self)` and a user gesture.
- `crossOriginIsolated` stays `false` and no feature asks for it (ADR-0003 §6).
- OPFS quota in the frame may differ from standalone where storage is partitioned (ADR-0021).

**Set-up.**
- Portal attributes, read from `taro-kit/src/modules/security-policy/frame.ts`
  (`frameAttributesFor`) for Clip Maker's catalog permissions (`downloads`, `dialogs`,
  `fullscreen`, optional `popups`):
  `sandbox="allow-scripts allow-same-origin allow-forms allow-downloads allow-modals"`,
  `allow="fullscreen"`, `referrerpolicy="strict-origin"`. The host page sends the portal's
  headers (`headers.ts`): CSP `frame-ancestors 'none'; object-src 'none'; base-uri 'self'`,
  `Permissions-Policy: fullscreen=(self "<tool origin>"), clipboard-write=(self), …=()`, COOP
  `same-origin`, no COEP.
- The tool page and every worker and worklet script send the ADR-0014 headers: CSP with
  `connect-src 'self'`, no `'wasm-unsafe-eval'`, `frame-ancestors <stub host origins>`;
  `Permissions-Policy: fullscreen=(self)`; COOP `same-origin`; no COEP or CORP.
- Three contexts:
  - **standalone**;
  - **embedded same-site**: host `localhost:5180` → tool `localhost:5181`. This is the production
    shape, because `tarokit.app` → `clip-maker.tarokit.app` is one site;
  - **embedded cross-site**: host `127.0.0.1:5180` → tool `localhost:5181`. This is the worst case
    for storage partitioning.

**Measures** (pass/fail plus detail, per feature × engine × context).
1. Module worker, with a static `import`.
2. WebGL2 in a worker, on a canvas handed over with `transferControlToOffscreen()` and on an
   unattached `OffscreenCanvas`: shader draw + `readPixels` check, and the half-float and float
   colour buffers.
3. `AudioWorklet`: `addModule` under the CSP, the node running, and blocks streamed from a worker
   to the worklet over a transferred `MessagePort` (ADR-0003 §3).
4. WebCodecs in a worker: a video encode → decode round trip (first supported of H.264, VP8,
   VP9), plus an audio encode (AAC or Opus).
5. OPFS:
   - `getDirectory()`;
   - `createSyncAccessHandle()` write and read of 8 MB in a worker;
   - `storage.estimate()` quota and usage, and `persisted()`;
   - whether files written standalone are visible embedded (partitioning).
6. `<a download>` of a blob in three cases:
   - after a click;
   - with no user activation (more than 5 s after the last gesture, as at the end of a long
     export);
   - of an OPFS `File` (the ADR-0010 save path).
7. Full screen: `fullscreenEnabled`, `requestFullscreen()` on a click, then exit.
8. Ready signal: `{type:'taro:ready'}` to the host origin; the host answers with the theme and
   focuses the frame.
9. Isolation:
   - `crossOriginIsolated` and `SharedArrayBuffer`;
   - CSP violations seen during the run;
   - CSP sanity: a `fetch` to another origin and `WebAssembly.compile` are both refused.

**Pass criteria.**
- Every feature passes embedded (both sites) and standalone, in Chromium and WebKit. Otherwise a
  fallback is written for ADR-0003 or ADR-0010.
- `crossOriginIsolated === false` everywhere, with all features passing.
- Zero CSP violations from the features under test.

**Engines.**
- Automated: Playwright chromium, the chrome channel (Google Chrome, D-035) and webkit.
- Owner: Firefox and iOS Safari (steps in `spikes/frame/README.md`).

**Time box.** 1 day.

**Not built.** No app code, no UI beyond the test page, no real media pipeline and no service
worker. No speed measurements (SP-compositor and SP-storage cover speed). No Android.

---

## Results (2026-11-03, automated part; branch `spike/frame`)

**Status: partial.** The automated engines are done. Real Firefox, real Safari (macOS) and iOS
Safari are waiting on the owner (steps in `spikes/frame/README.md`). About 0.4 d of the 1 d box
was used.

**Prototype.** `spikes/frame/` holds `serve.mjs` (host and tool servers), `host/` (the stub
portal), `public/` (the test page, module worker, worklet) and `run-playwright.mjs`. Raw data is
in `spikes/frame/results/frame-*.json`, one file per engine, with all three contexts in each.

Commands (Playwright 1.64.1, macOS, Apple M3):
- `node run-playwright.mjs`
- `node run-playwright.mjs webkit --persistent`
- `node run-playwright.mjs chromium chrome --partitioned`

### Feature × engine (SA standalone · SS embedded same-site · XS embedded cross-site)
| Feature | Chromium 156 (bundled) | Chrome 156 (channel) | WebKit 27.2 (Playwright) |
|---|---|---|---|
| Not isolated (`crossOriginIsolated` false, no `SharedArrayBuffer`), secure context | ✓ SA SS XS | ✓ | ✓ |
| Module worker with static `import` | ✓ | ✓ | ✓ |
| WebGL2 in a worker, transferred canvas, `readPixels` exact | ✓ | ✓ | ✓ |
| WebGL2 on an unattached `OffscreenCanvas`; RGBA16F FBO, 33³ 3D texture | ✓ | ✓ | ✓ |
| WebCodecs in a worker (H.264 encode → decode 10/10, Opus encode → decode) | ✓ | ✓ | ✓ |
| OPFS `createSyncAccessHandle` 8 MB in a worker | ✓ (≈ 480–645 MB/s) | ✓ | ✗ ephemeral context (`UnknownError` at `getDirectory`); ✓ persistent profile (≈ 1000 MB/s) |
| `storage.estimate()` quota | 10 248 MB, the same in every context | same | ephemeral: 1000 SA / **100** SS, XS; persistent: 19 661 SA / **1 966** SS, XS |
| Ready signal → host answers theme + language, host focus lands in the frame | ✓ | ✓ | ✓ |
| `<a download>` blob after a click | ✓ | ✓ | ✓ |
| `<a download>` 6 s after the click (no transient activation) | ✓ | ✓ | ✓ |
| `<a download>` of an OPFS `File` (8 MB) | ✓ | ✓ | ✓ (persistent) |
| Full screen on click (`allow="fullscreen"` + `fullscreen=(self)`), then exit | ✓ | ✓ | ✓ (headless) |
| `AudioWorklet` running, 200 blocks worker → worklet over a transferred port | ✓ | ✓ | ✓, but `resume()` never settles (see below) |
| Same worklet on an `OfflineAudioContext` (peak 0.1) | ✓ | ✓ | ✓ |
| CSP: cross-origin `fetch` refused, own `fetch` ok, `WebAssembly.compile` refused | ✓ | ✓ | ✓ |
| CSP violations other than the two deliberate probes | 0 | 0 | 0 |

Every ✓ holds for SA, SS and XS. **No feature behaved differently embedded than standalone**,
except the storage quota and partitioning in WebKit (below). Everything ran with no COEP and
`crossOriginIsolated === false`.

### Storage partitioning (the marker files from earlier contexts that are visible in OPFS)
- Playwright turns Chromium's partitioning off by default (`ThirdPartyStoragePartitioning` in its
  `--disable-features`, playwright#32230). In the default runs, every context shared one OPFS.
- With partitioning back on (`--partitioned`, which matches real Chrome):
  - **same-site embedded shares OPFS with standalone**: SS saw `marker-standalone.txt`;
  - cross-site embedded is separate: XS saw nothing.

  Production is `tarokit.app` → `clip-maker.tarokit.app`, which is the same site. So in Chrome
  the embedded and standalone tool share storage and quota.
- WebKit keeps each context separate, including same-site: SS saw no standalone marker. Its quota
  in a frame is **1/10** of the standalone quota.

### What surprised us
1. **WebKit frame quota is 1/10 of standalone**, even same-site: 1 966 MB vs 19 661 MB on this
   Mac. On a phone with little free space, the embedded quota may be smaller than a long 1080p
   export, so ADR-0010's `no_space` path becomes a real path in the frame, not an edge case.
   SP-storage must measure this on real Safari and iOS.
2. **ADR-0021's "embedded storage is partitioned" holds only for WebKit and for cross-site
   Chromium.** For the production shape in Chrome, standalone and embedded share OPFS. So a
   start-up sweep in one context can delete the other context's live export scratch if both are
   open at once. Scratch names must be unique per session (for example a random id), and the
   sweep must skip files that are locked or recent.
3. **WebKit `AudioContext.resume()` never resolves** in Playwright WebKit, headless or headed,
   even though `state` becomes `running` and the worklet plays. The app must not `await resume()`
   without a bound. It should watch `statechange` or `state` with a timeout.
4. **Playwright WebKit's default (ephemeral) context has no OPFS.** Export e2e on WebKit must use
   a persistent context, or the test exercises the no-scratch fallback instead. Owner check: real
   Safari Private Browsing may behave the same way.
5. A download with no user activation, more than 5 s after the gesture, works in every engine with
   `allow-downloads`. The end-of-export save needs no second tap, at least on desktop.
6. Posting `taro:ready` to every allowed origin works, but each wrong origin logs an error.
   `location.ancestorOrigins[0]` (Chromium, WebKit) and `document.referrer` (the portal sends
   `referrerpolicy="strict-origin"`) both give the host origin, so the tool can post exactly once.
   Firefox has no `ancestorOrigins`, so it uses the referrer.
7. Playwright's Firefox (Nightly build 1555) did not launch on this machine. Gecko is manual
   only, as planned.

### Against the pass criteria
| Criterion | Result |
|---|---|
| All features work embedded and standalone (Chromium, WebKit) | **Met** for capabilities. Storage capacity differs in WebKit (1/10 in a frame). |
| `crossOriginIsolated === false` with everything passing (no COOP/COEP needed) | **Met** in every engine and context |
| No CSP violations from the features | **Met**: 0 unexpected; `worker-src 'self'` and `script-src 'self'` cover the workers and the worklet |
| Firefox and iOS Safari | **Pending owner** (README). Expected: iPhone refuses element full screen, which RULE-17 already allows. |

### Recommendation: **adopt** (provisional, pending owner runs)
The frame contract (RULE-17), the portal attributes (`downloads`, `dialogs`, `fullscreen`) and
ADR-0014's headers need no change. ADR-0003 is confirmed: no isolation, and workers, worklet,
WebGL2 and WebCodecs all work in the frame. Spec and architecture follow-ups:
- **ADR-0010 / F-019.R7 (SP-storage):**
  - in the WebKit engine, the frame's quota is 1/10 of standalone;
  - check `storage.estimate()` against the export estimate before export, and fall back to memory
    or `no_space` as written;
  - scratch file names must be unique per session;
  - the sweep must not delete a file that another open context of the same tool (same-site
    sharing in Chrome) is still writing.
- **ADR-0021 correction for this tool's ADRs:** storage is shared between embedded and standalone
  in Chromium for the production site (same-site). It is separate in WebKit and in cross-site
  Chromium.
- **MOD-Audio:** use a bounded wait on `resume()` and treat the context `state` as the truth.
- **MOD-Host:** post the ready signal once, to the parent origin (from `ancestorOrigins` or the
  referrer), checked against the allowed list.
- **ADR-0016 (tests):** run WebKit e2e that touches OPFS in a persistent context. Add
  `--partitioned` behaviour (re-enabling `ThirdPartyStoragePartitioning`) to the frame e2e for
  Chromium.

## Owner device results (2026-11-04)
Runs: Safari 27 macOS and Firefox 158, each standalone, embedded same-site and embedded cross-site; iPhone Safari 27, standalone and embedded same-site. The JSON files are in the worktree's `spikes/frame/results/manual/`.
- **All pass:** module and WebGL2 workers, WebCodecs, OPFS, downloads, the ready signal and focus.
- **CSP violations:** the only ones logged are the deliberate connect-src probe, plus wasm-eval in Firefox. Both are expected.
- **iPhone has no `requestFullscreen` for pages.** The preview uses the maximise-in-page fallback (F-002.R7).
- **iPhone, standalone only:** the worklet `addModule` failed on CORS for a same-origin module; embedded it passed. The build must serve worklets with `Access-Control-Allow-Origin` and re-check on iOS in QA.
- **Firefox, standalone:** `downloadOpfsFile` returned NotFoundError, a timing issue that SP-storage's 10 s rule covers.

**Verdict: adopt.**
