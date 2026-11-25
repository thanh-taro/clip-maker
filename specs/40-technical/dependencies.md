# Dependencies & assets

Policy: ADR-0001 (the suite's allow-lists; exceptions only by ADR). Every direct dependency, every
transitive **runtime** dependency, every asset pack and every music track (none ship since D-052) is registered here before
it enters the lockfile or the repository. Versions and licences of the suite packages follow the
sibling tools' registries; new rows were checked on the npm registry on 2026-11-03. The licence
audit re-verifies every row against the real lockfile before approval.

Kinds: **runtime** = shipped to the browser (main bundle, a worker or the worklet; no lazy chunks,
ADR-0002); **asset** = shipped non-code file; **build** / **dev** = never shipped.
Status: `proposed` → `approved` → `removed` (or `needs-owner`). The licence audit of 2026-11-04 approved every
verified row; no row is open. Owner approvals: DEP-04 (D-042), DEP-34 (D-035), DEP-12 (D-048), DEP-13
(look sign-off, 2026-11-19), and DEP-14 with its tracks DEP-41 … DEP-49 (approval of the CC0 music
download, 2026-11-20). DEP-26 was removed (D-047). DEP-14 and DEP-41 … DEP-49 were removed on 2026-11-25 (owner decision D-052: the tool ships no music). Spike outcomes (2026-11-04) removed the fallbacks
DEP-37 … DEP-40.

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
| **DEP-13** | Clip Maker looks pack (16 `.cube` sources → 33³ PNG strips) | versioned in the repository with checksums: `src/assets/looks/looks.json` (per strip: bytes, SHA-256, the `.cube` source's SHA-256, 8-bit storage ΔE00); 16 strips, 167,723 bytes, 3.4–17.4 KB each | Owner's own work: authored 2026-11-17 as parametric colour transforms in `scripts/make-looks.mjs` (no third-party look, table or image; nothing downloaded), which writes the `.cube` sources and converts them | asset | RULE-09 looks (`30-experience/looks.md`, F-008) | approved — owner's look sign-off 2026-11-19, all 16 looks as generated (F-008 edge case, build question 146) | ADR-0007, ADR-0013 |
| **DEP-14** | Clip Maker music pack (manifest) | versioned with checksums | Each track CC0 1.0 or public domain (D-010); one row per track below | asset | RULE-12 bundled music, AAC-LC 128 kbps M4A, ≤ 10 MB total: 9 tracks (DEP-41 … DEP-49), 9,038,597 bytes; `src/assets/music/music.json` written by `scripts/make-music.mjs` | removed (owner D-052, 2026-11-25: the tool ships no music, so no content-ID claim can come from shipped tracks; was approved 2026-11-20) | ADR-0013 |

### Music tracks (removed, D-052)
Removed on 2026-11-25 by owner decision D-052: the tool ships no music; music comes only from the
user's own audio files (F-011.R1). The rows are kept for history. What follows describes the pack as it
was. One row per track (title, author, source URL, licence and the date it was checked, saved copy of the
dedication page, file checksum, length, size; ADR-0013 §4). Nine CC0 1.0 tracks from Free Music Archive,
picked from the shortlist (`.build-my-app/reports/music-shortlist.md`) and downloaded with the owner's
approval of 2026-11-20. Each track's own page shows the CC0 1.0 Universal dedication; the saved pages and
the download record (page URL, file URL, size, SHA-256 of the source MP3, retrieval date) are kept in
`licences/music/`, which is never bundled. `scripts/make-music.mjs` cuts each track to its first 60 s
(the calm Komiku piece to 75 s) with a 2 s fade-out, normalises it to about −16 LUFS and encodes it with
the operating system's AAC converter (ADR-0013 §2). CC0 is the uploader's declaration and cannot stop a
third party's automated content-ID claim on an export; the tool credits every track anyway (F-011.R6,
F-020.R4). `scripts/check-dist.mjs` fails on any shipped `.m4a` without a row here. The generated
placeholder tones that stood in until 2026-11-20 are deleted (their rows DEP-41 … DEP-43 are reused).

| ID | Name | Version range | License | Kind | Purpose | Status | Decided by |
|---|---|---|---|---|---|---|---|
| **DEP-41** | Music track: Roller Fever by Loyalty Freak Music — roller-fever.m4a | sha256 aaa2fb7daf09154e…, 977,205 bytes, 60 s (AAC-LC 128 kbps; first 60 s of the source with a 2 s fade-out, scripts/make-music.mjs); source MP3 sha256 fa9986971c761897…, 5,900,130 bytes | CC0-1.0 (CC0 1.0 Universal dedication on the track page, checked 2026-11-20; saved copy licences/music/roller-fever.html; provenance licences/music/provenance.json) | asset | RULE-12 bundled music (F-011). Author: Loyalty Freak Music. Source: https://freemusicarchive.org/music/Loyalty_Freak_Music/ROLLER_DISCO_DANCE_DANCE/Loyalty_Freak_Music_-_ROLLER_DISCO_DANCE_DANCE_-_01_Roller_Fever/ | removed (owner D-052, 2026-11-25; was approved 2026-11-20) | ADR-0013 |
| **DEP-42** | Music track: Snow Drift by HoliznaCC0 — snow-drift.m4a | sha256 27c2ee30828c4068…, 977,215 bytes, 60 s (AAC-LC 128 kbps; first 60 s of the source with a 2 s fade-out, scripts/make-music.mjs); source MP3 sha256 7e7b7f7adeebf4c0…, 6,945,805 bytes | CC0-1.0 (CC0 1.0 Universal dedication on the track page, checked 2026-11-20; saved copy licences/music/snow-drift.html; provenance licences/music/provenance.json) | asset | RULE-12 bundled music (F-011). Author: HoliznaCC0. Source: https://freemusicarchive.org/music/holiznacc0/winter-lofi/snow-drift/ | removed (owner D-052, 2026-11-25; was approved 2026-11-20) | ADR-0013 |
| **DEP-43** | Music track: Boss 3 : This is the time to glisten by Komiku — boss-3.m4a | sha256 2223c1d0d750006e…, 977,198 bytes, 60 s (AAC-LC 128 kbps; first 60 s of the source with a 2 s fade-out, scripts/make-music.mjs); source MP3 sha256 def226192492f44a…, 6,583,138 bytes | CC0-1.0 (CC0 1.0 Universal dedication on the track page, checked 2026-11-20; saved copy licences/music/boss-3.html; provenance licences/music/provenance.json) | asset | RULE-12 bundled music (F-011). Author: Komiku. Source: https://freemusicarchive.org/music/Komiku/ULTRA_PERSON_VOL2/Komiku_-_ULTRA_PERSON_VOL2_-_08_Boss_3_-_This_is_the_time_to_glisten/ | removed (owner D-052, 2026-11-25; was approved 2026-11-20) | ADR-0013 |
| **DEP-44** | Music track: Phonk ish by HoliznaCC0 — phonk-ish.m4a | sha256 27b7619bc823a761…, 977,267 bytes, 60 s (AAC-LC 128 kbps; first 60 s of the source with a 2 s fade-out, scripts/make-music.mjs); source MP3 sha256 1b9f5f16caf1e3db…, 5,823,523 bytes | CC0-1.0 (CC0 1.0 Universal dedication on the track page, checked 2026-11-20; saved copy licences/music/phonk-ish.html; provenance licences/music/provenance.json) | asset | RULE-12 bundled music (F-011). Author: HoliznaCC0. Source: https://freemusicarchive.org/music/holiznacc0/phonk-aura-farming/phonk-ish/ | removed (owner D-052, 2026-11-25; was approved 2026-11-20) | ADR-0013 |
| **DEP-45** | Music track: Love Train by Loyalty Freak Music — love-train.m4a | sha256 3ee5a06fb3560839…, 977,117 bytes, 60 s (AAC-LC 128 kbps; first 60 s of the source with a 2 s fade-out, scripts/make-music.mjs); source MP3 sha256 c2462ccf48a5b8e1…, 4,905,575 bytes | CC0-1.0 (CC0 1.0 Universal dedication on the track page, checked 2026-11-20; saved copy licences/music/love-train.html; provenance licences/music/provenance.json) | asset | RULE-12 bundled music (F-011). Author: Loyalty Freak Music. Source: https://freemusicarchive.org/music/Loyalty_Freak_Music/POSITIVE_ATTITUDE_/Loyalty_Freak_Music_-_POSITIVE_ATTITUDE__-_03_Love_Train/ | removed (owner D-052, 2026-11-25; was approved 2026-11-20) | ADR-0013 |
| **DEP-46** | Music track: Lullabies For The End Of The World #2 by HoliznaCC0 — lullabies-2.m4a | sha256 7d224356504ccac1…, 977,117 bytes, 60 s (AAC-LC 128 kbps; first 60 s of the source with a 2 s fade-out, scripts/make-music.mjs); source MP3 sha256 560c94fee94f9049…, 5,760,163 bytes | CC0-1.0 (CC0 1.0 Universal dedication on the track page, checked 2026-11-20; saved copy licences/music/lullabies-2.html; provenance licences/music/provenance.json) | asset | RULE-12 bundled music (F-011). Author: HoliznaCC0. Source: https://freemusicarchive.org/music/holiznacc0/lullabies-for-the-end-of-the-world/lullabies-for-the-end-of-the-world-2/ | removed (owner D-052, 2026-11-25; was approved 2026-11-20) | ADR-0013 |
| **DEP-47** | Music track: One Cool Minute by Loyalty Freak Music — one-cool-minute.m4a | sha256 3cab5ac9810c02bb…, 977,117 bytes, 60 s (AAC-LC 128 kbps; first 60 s of the source with a 2 s fade-out, scripts/make-music.mjs); source MP3 sha256 8778d1e095ab7c67…, 7,799,650 bytes | CC0-1.0 (CC0 1.0 Universal dedication on the track page, checked 2026-11-20; saved copy licences/music/one-cool-minute.html; provenance licences/music/provenance.json) | asset | RULE-12 bundled music (F-011). Author: Loyalty Freak Music. Source: https://freemusicarchive.org/music/Loyalty_Freak_Music/MINIMAL_AMBIENT_BOUNCE/Loyalty_Freak_Music_-_MINIMAL_AMBIENT_BOUNCE_-_02_One_Cool_Minute/ | removed (owner D-052, 2026-11-25; was approved 2026-11-20) | ADR-0013 |
| **DEP-48** | Music track: A calm moment to remember before taking the dangerous road by Komiku — calm-moment.m4a | sha256 09d2c3d961f2858d…, 1,221,244 bytes, 75 s (AAC-LC 128 kbps; first 75 s of the source with a 2 s fade-out, scripts/make-music.mjs); source MP3 sha256 4bba3aedc464836e…, 3,168,306 bytes | CC0-1.0 (CC0 1.0 Universal dedication on the track page, checked 2026-11-20; saved copy licences/music/calm-moment.html; provenance licences/music/provenance.json) | asset | RULE-12 bundled music (F-011). Author: Komiku. Source: https://freemusicarchive.org/music/Komiku/Helice_Awesome_Dance_Adventure_/a-calm-moment-to-remember-before-taking-the-dangerous-road | removed (owner D-052, 2026-11-25; was approved 2026-11-20) | ADR-0013 |
| **DEP-49** | Music track: Go to the Picnic by Loyalty Freak Music — go-to-the-picnic.m4a | sha256 81181554f3608efb…, 977,117 bytes, 60 s (AAC-LC 128 kbps; first 60 s of the source with a 2 s fade-out, scripts/make-music.mjs); source MP3 sha256 dbeaad7bb137f39f…, 7,544,987 bytes | CC0-1.0 (CC0 1.0 Universal dedication on the track page, checked 2026-11-20; saved copy licences/music/go-to-the-picnic.html; provenance licences/music/provenance.json) | asset | RULE-12 bundled music (F-011). Author: Loyalty Freak Music. Source: https://freemusicarchive.org/music/Loyalty_Freak_Music/POSITIVE_ATTITUDE_/Loyalty_Freak_Music_-_POSITIVE_ATTITUDE__-_01_Go_to_the_Picnic/ | removed (owner D-052, 2026-11-25; was approved 2026-11-20) | ADR-0013 |

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
  icons (ISC), the owner's looks and tokens. No music (D-052).
- `/third-party-notices.txt` and the in-tool notices (F-020.R4) are generated from this file; the
  dist scan fails if anything ships that is not an approved runtime or asset row.
