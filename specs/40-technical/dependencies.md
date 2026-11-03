# Dependencies & assets

Policy: ADR-0001 (the suite's allow-lists; exceptions only by ADR). Every direct dependency, every
transitive **runtime** dependency, every asset pack and every music track is registered here before
it enters the lockfile or the repository. Versions and licences of the suite packages follow the
sibling tools' registries; new rows were checked on the npm registry on 2026-11-03. The licence
audit re-verifies every row against the real lockfile before approval.

Kinds: **runtime** = shipped to the browser (main bundle, a worker or the worklet; no lazy chunks,
ADR-0002); **asset** = shipped non-code file; **build** / **dev** = never shipped.
Status: `proposed` → `approved` → `removed`. **Every row is `proposed`** until the licence audit
(and, for DEP-04 and DEP-34, the owner) approves it.

## Runtime (shipped)
| ID | Name | Version range | License | Kind | Purpose | Status | Decided by |
|---|---|---|---|---|---|---|---|
| **DEP-01** | preact | ~10.29 (suite pin; 11.x exists, adopt only with the suite) | MIT | runtime | UI chrome rendering | proposed | ADR-0002 |
| **DEP-02** | @preact/signals | ^2.11 | MIT | runtime | App state: project, history, selection, playhead, notices | proposed | ADR-0002, ADR-0011 |
| **DEP-03** | @preact/signals-core | transitive of DEP-02 (^1.x) | MIT | runtime | Signals runtime | proposed | ADR-0002 |
| **DEP-04** | mediabunny | exact 1.65.x (pinned; updated deliberately) | MPL-2.0 (scoped exception, ADR-0005, owner-approved D-042) | runtime | Reading MP4/MOV/WebM/MKV/MP3/ADTS/Ogg/FLAC/WAV in pieces; writing MP4/WebM/M4A/Ogg to a streaming target; low-level parts only, unmodified, no `@mediabunny/*` extensions | approved | ADR-0005 |
| **DEP-05** | gifenc | 1.0.3 | MIT | runtime | GIF palette quantisation and encoding (RULE-16); small, stable, unmaintained since 2021 — acceptable for a frozen format | proposed | ADR-0010 |
| **DEP-35** | @types/dom-webcodecs | transitive of DEP-04 (0.1.x) | MIT | build (types only; nothing ships) | Type declarations pulled by DEP-04 | proposed | ADR-0005 |
| **DEP-36** | @types/dom-mediacapture-transform | transitive of DEP-04 (0.1.x) | MIT | build (types only; nothing ships) | Type declarations pulled by DEP-04 | proposed | ADR-0005 |

## Assets (shipped)
| ID | Name | Version range | License | Kind | Purpose | Status | Decided by |
|---|---|---|---|---|---|---|---|
| **DEP-06** | @fontsource-variable/manrope | ^5 | OFL-1.1 | asset | UI face and the Sans text typeface (weight 700); `latin` + `vietnamese` subsets | proposed | ADR-0002, ADR-0012 |
| **DEP-07** | @fontsource-variable/jetbrains-mono | ^5 | OFL-1.1 | asset | Numbers in the UI (time codes, values); `latin` + `vietnamese` | proposed | ADR-0002 |
| **DEP-08** | @fontsource/anton | ^5 | OFL-1.1 | asset | Display text typeface, weight 400; `latin` + `vietnamese` | proposed (design sign-off on Vietnamese marks) | ADR-0012 |
| **DEP-09** | @fontsource/playfair-display | ^5 | OFL-1.1 | asset | Serif text typeface, weight 700; `latin` + `vietnamese` | proposed (design sign-off) | ADR-0012 |
| **DEP-10** | @fontsource/nunito | ^5 | OFL-1.1 | asset | Rounded text typeface, weight 800; `latin` + `vietnamese` | proposed (design sign-off) | ADR-0012 |
| **DEP-11** | lucide-static | ^1.55 | ISC (+ Feather MIT notice) | asset | Icons, only used SVGs inlined at build | proposed | ADR-0002 |
| **DEP-12** | Portal design tokens (`tokens.json`) | copy pinned to a portal commit | Owner's own work | asset (source) | Colours, spacing, radii, motion shared with the portal | proposed | ADR-0002 |
| **DEP-13** | Clip Maker looks pack (16 `.cube` sources → 33³ PNG strips) | versioned in the repository with checksums | Owner's own work | asset | RULE-09 looks (`30-experience/looks.md`) | proposed (authored in design) | ADR-0007, ADR-0013 |
| **DEP-14** | Clip Maker music pack (manifest) | versioned with checksums | Each track CC0 1.0 or public domain (D-010); one row per track below | asset | RULE-12 bundled music, AAC-LC 128 kbps M4A, ≤ 10 MB total | proposed (tracks not yet chosen) | ADR-0013 |

### Music tracks
One row per track, added during the licence audit (title, author, source URL, licence and the date
it was checked, saved copy of the dedication page, file checksum, length, size). None yet:
candidate sources and exclusions are in ADR-0013. At least 8 tracks are needed (RULE-12).

## Build, dev, test (never shipped)
| ID | Name | Version range | License | Kind | Purpose | Status | Decided by |
|---|---|---|---|---|---|---|---|
| **DEP-15** | typescript | ~6.0 (suite) | Apache-2.0 | dev | Type checking | proposed | ADR-0002 |
| **DEP-16** | vite | ^8.3 (suite) | MIT | build | Dev server, bundling, module workers, worklet module | proposed | ADR-0002 |
| **DEP-17** | @preact/preset-vite | ^2.10 | MIT | build | Preact JSX for Vite | proposed | ADR-0002 |
| **DEP-18** | lightningcss (via vite) | transitive | MPL-2.0 (build-only, ADR-0001) | build | CSS transforms | proposed | ADR-0001 |
| **DEP-19** | caniuse-lite (via browserslist) | transitive | CC-BY-4.0 (data, not shipped) | build | Browser targets | proposed | ADR-0001 |
| **DEP-20** | style-dictionary | ~5.5 | Apache-2.0 | dev | Tokens → CSS variables | proposed | ADR-0002 |
| **DEP-21** | vitest | ^5.0 | MIT | dev | Unit, integration, bench | proposed | ADR-0016 |
| **DEP-22** | fast-check | ^4.10 | MIT | dev | Property tests (rule maths, undo, DSP, grade) | proposed | ADR-0016 |
| **DEP-23** | @playwright/test | ~1.63 | Apache-2.0 | dev | E2E, golden frames, request log, host stub | proposed | ADR-0016 |
| **DEP-24** | Playwright browser binaries (Chromium, WebKit) | via DEP-23 | Chromium BSD; WebKit LGPL-2.1 (test-only) | dev | E2E engines | proposed | ADR-0016 |
| **DEP-25** | @axe-core/playwright (axe-core) | ^4.13 | MPL-2.0 (dev-only) | dev | Accessibility audit | proposed | ADR-0016 |
| **DEP-26** | @lhci/cli | ^0.15 | Apache-2.0 | dev | Start-up budget (NFR-02) | proposed | ADR-0016 |
| **DEP-27** | eslint | ^10 | MIT | dev | Lint, API bans, module boundaries | proposed | ADR-0002 |
| **DEP-28** | typescript-eslint | ^8.71 | MIT | dev | TS lint rules | proposed | ADR-0002 |
| **DEP-29** | eslint-plugin-jsx-a11y | ^6.10 | MIT | dev | Accessibility lint | proposed | ADR-0002 |
| **DEP-30** | prettier | ^3.9 | MIT | dev | Formatting | proposed | ADR-0002 |
| **DEP-31** | wrangler | ^4 (pinned) | MIT OR Apache-2.0 (its sharp pulls LGPL libvips binaries, deploy-only) | dev (deploy) | Deploy static assets by hand (phase 7), staging and production | proposed | ADR-0014 |
| **DEP-32** | pnpm | 11.x | MIT | dev | Package manager, licence report | proposed | ADR-0002 |
| **DEP-33** | mkcert | latest release (installed as a system tool, not an npm package) | BSD-3-Clause | dev | Locally trusted HTTPS certificate so phones on the LAN can open the local dev server (codec APIs need a secure context) | proposed | ADR-0014 |
| **DEP-34** | Google Chrome (stable, installed browser used through Playwright's `chrome` channel) | latest stable | Proprietary freeware (Google terms) — dev-only, never shipped; **owner decision** | dev | Automated tests of the H.264/AAC paths, which the open-source Chromium lacks | proposed (owner) | ADR-0016 |

## Evaluated, not adopted (recorded fallbacks)
| ID | Name | Version range | License | Kind | Purpose | Status | Decided by |
|---|---|---|---|---|---|---|---|
| **DEP-37** | mp4box (mp4box.js) | ^2.5 | BSD-3-Clause | runtime (fallback) | Permissive MP4/MOV reader if DEP-04 is declined | proposed (fallback, not adopted) | ADR-0005 |
| **DEP-38** | mp4-muxer | 5.2.2 (frozen; deprecated in favour of DEP-04) | MIT | runtime (fallback) | Permissive MP4 writer if DEP-04 is declined | proposed (fallback, not adopted) | ADR-0005 |
| **DEP-39** | webm-muxer | 5.1.4 (frozen; deprecated in favour of DEP-04) | MIT | runtime (fallback) | Permissive WebM writer if DEP-04 is declined | proposed (fallback, not adopted) | ADR-0005 |
| **DEP-40** | signalsmith-stretch | ^1.3 | MIT (WebAssembly; would need `'wasm-unsafe-eval'`) | runtime (fallback) | Time-stretch if our own WSOLA fails SP-timestretch | proposed (fallback, not adopted) | ADR-0008 |

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
- Shipped third-party code: Preact + signals (MIT), gifenc (MIT) and, if approved, mediabunny
  (MPL-2.0, unmodified, with notice and source link). Shipped assets: five font packages (OFL),
  icons (ISC), the owner's looks and tokens, CC0 music.
- `/third-party-notices.txt` and the in-tool notices (F-020.R4) are generated from this file; the
  dist scan fails if anything ships that is not an approved runtime or asset row.
