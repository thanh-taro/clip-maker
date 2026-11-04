# Dependencies & assets

Policy: ADR-0001 (the suite's allow-lists; exceptions only by ADR). Every direct dependency, every
transitive **runtime** dependency, every asset pack and every music track is registered here before
it enters the lockfile or the repository. Versions and licences of the suite packages follow the
sibling tools' registries; new rows were checked on the npm registry on 2026-11-03. The licence
audit re-verifies every row against the real lockfile before approval.

Kinds: **runtime** = shipped to the browser (main bundle, a worker or the worklet; no lazy chunks,
ADR-0002); **asset** = shipped non-code file; **build** / **dev** = never shipped.
Status: `proposed` → `approved` → `removed` (or `needs-owner`). The licence audit of 2026-11-04 approved every
verified row; open items: DEP-12, DEP-13, DEP-14 (own work, music) and DEP-26 (`needs-owner`). Owner approvals so far: DEP-04 (D-042) and
DEP-34 (D-035). Spike outcomes (2026-11-04) removed the fallbacks DEP-37 … DEP-40.

## Runtime (shipped)
| ID | Name | Version range | License | Kind | Purpose | Status | Decided by |
|---|---|---|---|---|---|---|---|
| **DEP-01** | preact | ~10.29 (suite pin; 11.x exists, adopt only with the suite) | MIT; audited 2026-11-04, verified 10.29.8, no deps | runtime | UI chrome rendering | approved | ADR-0002 |
| **DEP-02** | @preact/signals | ^2.11 | MIT; audited 2026-11-04, verified 2.11.2 | runtime | App state: project, history, selection, playhead, notices | approved | ADR-0002, ADR-0011 |
| **DEP-03** | @preact/signals-core | transitive of DEP-02 (^1.x) | MIT; audited 2026-11-04, verified 1.14.5 | runtime | Signals runtime | approved | ADR-0002 |
| **DEP-04** | mediabunny | exact 1.65.x (pinned; 1.65.0 tested in the spikes, 1.65.1 on the registry 2026-11-04; updated deliberately) | MPL-2.0 (scoped exception, ADR-0005, owner-approved D-042) | runtime | Reading MP4/MOV/WebM/MKV/MP3/ADTS/Ogg/FLAC/WAV in pieces; writing MP4/WebM/M4A/Ogg to a streaming target; low-level parts only, unmodified, no `@mediabunny/*` extensions | approved | ADR-0005 |
| **DEP-05** | gifenc | 1.0.3 (exact; latest on the registry, checked 2026-11-04, last modified 2022-05-03) | MIT; audited 2026-11-04, verified 1.0.3, zero deps, unmaintained | runtime | GIF palette quantisation and encoding (RULE-16); small, stable, unmaintained since 2021 — acceptable for a frozen format. Not exercised by a spike (SP-ios used a minimal stand-in writer); verified in the build with the GIF timing test (NFR-08) | approved | ADR-0010 |
| **DEP-35** | @types/dom-webcodecs | transitive of DEP-04 (0.1.x) | MIT; audited 2026-11-04, verified 0.1.13 | build (types only; nothing ships) | Type declarations pulled by DEP-04 | approved | ADR-0005 |
| **DEP-36** | @types/dom-mediacapture-transform | transitive of DEP-04 (0.1.x) | MIT; audited 2026-11-04, verified 0.1.12 | build (types only; nothing ships) | Type declarations pulled by DEP-04 | approved | ADR-0005 |

## Assets (shipped)
| ID | Name | Version range | License | Kind | Purpose | Status | Decided by |
|---|---|---|---|---|---|---|---|
| **DEP-06** | @fontsource-variable/manrope | ^5 | OFL-1.1; audited 2026-11-04, OFL file verified, vietnamese subset present | asset | UI face and the Sans text typeface (weight 700); `latin` + `vietnamese` subsets | approved | ADR-0002, ADR-0012 |
| **DEP-07** | @fontsource-variable/jetbrains-mono | ^5 | OFL-1.1; audited 2026-11-04, OFL file verified, vietnamese subset present | asset | Numbers in the UI (time codes, values); `latin` + `vietnamese` | approved | ADR-0002 |
| **DEP-08** | @fontsource/anton | ^5 | OFL-1.1; audited 2026-11-04, OFL file verified, vietnamese subset present | asset | Display text typeface, weight 400; `latin` + `vietnamese` | approved (licence only; design sign-off on Vietnamese marks still pending) | ADR-0012 |
| **DEP-09** | @fontsource/playfair-display | ^5 | OFL-1.1; audited 2026-11-04, OFL file verified, Reserved Font Name: ship unmodified, vietnamese subset present | asset | Serif text typeface, weight 700; `latin` + `vietnamese` | approved (licence only; design sign-off still pending) | ADR-0012 |
| **DEP-10** | @fontsource/nunito | ^5 | OFL-1.1; audited 2026-11-04, OFL file verified, vietnamese subset present | asset | Rounded text typeface, weight 800; `latin` + `vietnamese` | approved (licence only; design sign-off still pending) | ADR-0012 |
| **DEP-11** | lucide-static | ^1.55 | ISC (+ Feather MIT notice); audited 2026-11-04, verified 1.55.0, keep the Feather MIT notice | asset | Icons, only used SVGs inlined at build | approved | ADR-0002 |
| **DEP-12** | Portal design tokens (`tokens.json`) | copy pinned to a portal commit | Owner's own work | asset (source) | Colours, spacing, radii, motion shared with the portal | approved (owner's own work, pinned to portal commit 4c4ae94, D-048) | ADR-0002 |
| **DEP-13** | Clip Maker looks pack (16 `.cube` sources → 33³ PNG strips) | versioned in the repository with checksums | Owner's own work | asset | RULE-09 looks (`30-experience/looks.md`) | proposed (nothing authored yet) | ADR-0007, ADR-0013 |
| **DEP-14** | Clip Maker music pack (manifest) | versioned with checksums | Each track CC0 1.0 or public domain (D-010); one row per track below | asset | RULE-12 bundled music, AAC-LC 128 kbps M4A, ≤ 10 MB total | proposed (no tracks yet) | ADR-0013 |

### Music tracks
One row per track, added during the licence audit (title, author, source URL, licence and the date
it was checked, saved copy of the dedication page, file checksum, length, size). None yet:
candidate sources and exclusions are in ADR-0013. At least 8 tracks are needed (RULE-12).

## Build, dev, test (never shipped)
| ID | Name | Version range | License | Kind | Purpose | Status | Decided by |
|---|---|---|---|---|---|---|---|
| **DEP-15** | typescript | ~6.0 (suite) | Apache-2.0; audited 2026-11-04, verified 6.0.3 | dev | Type checking | approved | ADR-0002 |
| **DEP-16** | vite | ^8.3 (suite) | MIT; audited 2026-11-04, verified 8.3.1 | build | Dev server, bundling, module workers, worklet module | approved | ADR-0002 |
| **DEP-17** | @preact/preset-vite | ^2.10 | MIT; audited 2026-11-04, verified 2.10.6 | build | Preact JSX for Vite | approved | ADR-0002 |
| **DEP-18** | lightningcss (via vite) | transitive | MPL-2.0 (build-only, ADR-0001); audited 2026-11-04, verified 1.33.0 | build | CSS transforms | approved | ADR-0001 |
| **DEP-19** | caniuse-lite (via browserslist) | transitive | CC-BY-4.0 (data, not shipped); audited 2026-11-04, verified 1.0.30001820 | build | Browser targets | approved | ADR-0001 |
| **DEP-20** | style-dictionary | ~5.5 | Apache-2.0; audited 2026-11-04, verified 5.5.5 | dev | Tokens → CSS variables | approved | ADR-0002 |
| **DEP-21** | vitest | ^5.0 | MIT; audited 2026-11-04, verified 5.0.2 | dev | Unit, integration, bench | approved | ADR-0016 |
| **DEP-22** | fast-check | ^4.10 | MIT; audited 2026-11-04, verified 4.10.2 | dev | Property tests (rule maths, undo, DSP, grade) | approved | ADR-0016 |
| **DEP-23** | @playwright/test | ~1.63 | Apache-2.0; audited 2026-11-04, verified 1.63.0 | dev | E2E, golden frames, request log, host stub | approved | ADR-0016 |
| **DEP-24** | Playwright browser binaries (Chromium, WebKit) | via DEP-23 | Chromium BSD; WebKit LGPL-2.1 (test-only); audited 2026-11-04, checked, test-only | dev | E2E engines | approved | ADR-0016 |
| **DEP-25** | @axe-core/playwright (axe-core) | ^4.13 | MPL-2.0 (dev-only); audited 2026-11-04, verified 4.13.0 (axe-core 4.13.0/4.14.0) | dev | Accessibility audit | approved | ADR-0016 |
| **DEP-26** | @lhci/cli | ^0.15 | Apache-2.0; audited 2026-11-04, Apache-2.0 verified 0.16.0 but tree has FSL-1.1-Apache-2.0 sentry@0.45.0 and PSF-2.0 argparse@3.0.4 | dev | Start-up budget (NFR-02) | removed (owner D-047: dropped for licence reasons; performance measured with Playwright + size budgets) | ADR-0016 |
| **DEP-27** | eslint | ^10 | MIT; audited 2026-11-04, verified 10.11.0 | dev | Lint, API bans, module boundaries | approved | ADR-0002 |
| **DEP-28** | typescript-eslint | ^8.71 | MIT; audited 2026-11-04, verified 8.71.0 | dev | TS lint rules | approved | ADR-0002 |
| **DEP-29** | eslint-plugin-jsx-a11y | ^6.10 | MIT; audited 2026-11-04, verified 6.10.2 | dev | Accessibility lint | approved | ADR-0002 |
| **DEP-30** | prettier | ^3.9 | MIT; audited 2026-11-04, verified 3.9.9 | dev | Formatting | approved | ADR-0002 |
| **DEP-31** | wrangler | ^4 (pinned) | MIT OR Apache-2.0 (its sharp pulls LGPL libvips binaries, deploy-only); audited 2026-11-04, verified 4.157.0 and tree | dev (deploy) | Deploy static assets by hand (phase 7), staging and production | approved | ADR-0014 |
| **DEP-32** | pnpm | 11.x | MIT; audited 2026-11-04, verified | dev | Package manager, licence report | approved | ADR-0002 |
| **DEP-33** | mkcert | latest release (installed as a system tool, not an npm package) | BSD-3-Clause; audited 2026-11-04, verified upstream LICENSE | dev | Locally trusted HTTPS certificate so phones on the LAN can open the local dev server (codec APIs need a secure context) | approved | ADR-0014 |
| **DEP-34** | Google Chrome (stable, installed browser used through Playwright's `chrome` channel) | latest stable | Proprietary freeware (Google terms) — dev-only, never shipped; **owner decision D-035 (approved)** | dev | Automated tests of HEVC decode, GPU fidelity and timing (the bundled Chromium has H.264/AAC on macOS but no HEVC and only software WebGL, SP-codec) | approved (owner, D-035) | ADR-0016 |

## Evaluated, not adopted (recorded fallbacks)
| ID | Name | Version range | License | Kind | Purpose | Status | Decided by |
|---|---|---|---|---|---|---|---|
| **DEP-37** | mp4box (mp4box.js) | ^2.5 | BSD-3-Clause | runtime (fallback) | Permissive MP4/MOV reader if DEP-04 is declined; measured in SP-license (19/26 corpus, +306 MB reading 4 GB) | removed (DEP-04 approved, D-042) | ADR-0005 |
| **DEP-38** | mp4-muxer | 5.2.2 (frozen; deprecated in favour of DEP-04) | MIT | runtime (fallback) | Permissive MP4 writer if DEP-04 is declined | removed (DEP-04 approved, D-042) | ADR-0005 |
| **DEP-39** | webm-muxer | 5.1.4 (frozen; deprecated in favour of DEP-04) | MIT | runtime (fallback) | Permissive WebM writer if DEP-04 is declined | removed (DEP-04 approved, D-042) | ADR-0005 |
| **DEP-40** | signalsmith-stretch | ^1.3 | MIT (WebAssembly; would need `'wasm-unsafe-eval'`, disallowed by D-032) | runtime (fallback) | Time-stretch if our own WSOLA fails SP-timestretch | removed (own WSOLA passed SP-timestretch incl. owner listening; a new decision would be needed) | ADR-0008 |

## Rejected (not allowed by ADR-0001 or D-003)
- soundtouchjs (LGPL-2.1) and wrappers around SoundTouch — time-stretch; LGPL is not allowed at runtime.
- Rubber Band (GPL) — time-stretch.
- `@mediabunny/aac-encoder`, ffmpeg.wasm and other FFmpeg builds — FFmpeg compiled to WebAssembly (D-003); LGPL/GPL.
- Music under CC-BY, CC-BY-SA, NC, ND, the Pixabay licence, or account-bound "royalty-free" terms (D-010).

## Platform features used (no dependency)
WebCodecs (`VideoDecoder`, `VideoEncoder`, `AudioDecoder`, `AudioEncoder`, `VideoFrame`,
`EncodedVideoChunk`), WebGL2 on `OffscreenCanvas`, Canvas 2D for text, `createImageBitmap`,
dedicated module workers, `AudioContext` + `AudioWorklet`, `Blob.slice`, the origin-private file
system (export scratch only), `navigator.storage.estimate`, `Intl` (`NumberFormat`, `PluralRules`,
`DurationFormat` where present, `Segmenter`), `document.fonts`, Cache Storage (service worker only),
Fullscreen API. Mapping in `platform-mapping.md`.

## Notes
- Shipped third-party code: Preact + signals (MIT), gifenc (MIT) and mediabunny (MPL-2.0,
  unmodified, with notice and source link; approved D-042, ≈ 108 KB gzip: reader 73 KB in the engine
  and analysis workers, writer 48 KB only in the export worker). Shipped assets: five font packages (OFL),
  icons (ISC), the owner's looks and tokens, CC0 music.
- `/third-party-notices.txt` and the in-tool notices (F-020.R4) are generated from this file; the
  dist scan fails if anything ships that is not an approved runtime or asset row.
