# Clip Maker — architecture proposal (phase 3.1)

Date: 2026-11-03 · Status: proposal for the owner · Specs read: `specs/` (all `ready`), the
image-annotator `specs/40-technical/` (accepted suite decisions), the portal's `tool-contract.md`
and its embedded-tool isolation ADR.

Written: `specs/40-technical/architecture.md`, `platform-mapping.md`, `dependencies.md`,
`modules/MOD-*.md` (19), `adr/ADR-0001 … ADR-0016` (all `proposed`). `spec_lint`: 0 errors,
0 warnings. No code, no packages, no provisioning.

## 1. Summary
Keep everything the suite already decided (Preact + signals, TypeScript/Vite/pnpm, tokens, copy,
language and host contract, hand-written service worker, Cloudflare static assets, local-only
checks, Playwright Chromium + WebKit). Build our own media engine on browser features:
WebCodecs for all decoding and encoding, one WebGL2 `paint(t)` for preview and every export, one
deterministic TypeScript mixer for preview and export (own WSOLA time-stretch, own true-peak
limiter), media streamed from `File`s with bounded caches, and an export worker writing to a
scratch file only during export. Use **mediabunny** for file reading/writing **if the owner
approves a scoped MPL-2.0 exception**; otherwise a permissive composite costing 2–3 extra weeks.
No `SharedArrayBuffer`, no WebAssembly, no cross-origin isolation, so the portal frame contract is
unchanged. One header differs from the suite: `connect-src 'self'` (own files only) to read the
look tables and music.

## 2. Reused suite decisions (not re-decided)
| Suite decision (image-annotator) | Here | Change for video |
|---|---|---|
| Licence policy (ADR 0001 there) | ADR-0001 | None; exception mechanism used by ADR-0005 |
| Preact + signals (0002), TS/Vite/pnpm + API ban + boundaries (0003), tokens/icons/fonts/copy (0013), language contract (0015), no code-host workflows (0014) | ADR-0002 | API ban extended (storage, file picker); four workers + worklet |
| Snapshot undo + change epoch (0008) | ADR-0011 | Media outside the document (source registry) |
| Text field over canvas glyphs, NFC (0009, 0020) | ADR-0012 | Four typefaces; raster on main thread → workers |
| Hosting, CSP, headers, environments (0010), frame findings (0021) | ADR-0014 | `connect-src 'self'`; `fullscreen=(self)`; staging proposed |
| Offline worker (0011) | ADR-0015 | Precache from a build manifest (music is not "loaded" at start) |
| Test stack (0012) | ADR-0016 | Media fixtures, golden frames, branded Chrome for H.264/AAC, no FFmpeg |

## 3. New decisions (alternatives → recommendation)
| # | Topic | Options | Recommendation | ADR |
|---|---|---|---|---|
| 1 | Decode/encode | WebCodecs · `<video>`+`MediaRecorder` · WASM codecs | **WebCodecs only**, start-up probe (decode, encode per size × rate, audio encoders, WebGL2 + timed render) | ADR-0004 |
| 1b | Fallback output | (a) MP4 H.264+Opus before WebM · (b) WebM VP9+Opus first · (c) WASM AAC (excluded, D-003) | **MP4 H.264+AAC → MP4 H.264+Opus → WebM VP9+Opus → WebM VP8+Opus**; audio-only AAC/M4A → Opus/Ogg; WAV always. Silent projects ignore audio encoders. **Owner confirms (a) vs (b)** | ADR-0004 |
| 2 | Container library | mediabunny (MPL-2.0, 1.65.0, active) · mp4box.js (BSD-3, active, MP4 read only in practice) + mp4-muxer/webm-muxer (MIT, **deprecated** 2025-07 "superseded by Mediabunny") + own WebM/MP3/Ogg/FLAC/ADTS/WAV readers · FFmpeg WASM (excluded) | **mediabunny, unmodified, pinned, notice + source link, no `@mediabunny/*` extensions** — pending SP-license and owner approval; permissive composite is the documented fallback | ADR-0005 |
| 3 | Compositor | WebGL2 · WebGPU · Canvas 2D filters · separate preview/export renderers | **WebGL2 on `OffscreenCanvas` in a worker, one `paint(plan)`**, half-float intermediate when renderable, deterministic integer-hash grain, 33³ looks as 3D textures, blur background, text bitmaps; CPU reference as test oracle | ADR-0006, ADR-0007 |
| 3b | HDR → SDR | Browser conversion · own shader | **Own shader** from 10-bit planes (PQ/HLG → tone curve → BT.709); browser path as per-engine fallback, used for both preview and export | ADR-0007 |
| 4 | Audio | Web Audio graph + `OfflineAudioContext` · own mixer | **Own deterministic mixer** (resample, stretch, gains, equal-power cross-fades, true-peak limiter with margin for codec overshoot) in an audio worker → `AudioWorklet` via `MessagePort`; **audio clock is master** | ADR-0008 |
| 4b | Time-stretch | SoundTouch (LGPL ✗) · Rubber Band (GPL ✗) · Signalsmith Stretch (MIT, WASM → CSP `'wasm-unsafe-eval'`) · own WSOLA · own phase vocoder | **Own WSOLA with fixed 1 s sync points** (seekable, identical in preview/export); Signalsmith as fallback via a superseding ADR | ADR-0008 |
| 5 | Input & memory | Whole-file reads · proxies (needs storage) · streaming + bounded caches | **`Blob.slice` streaming, probe pipeline, keyframe index, per-device LRU budgets** (phone ≤ 600 MB peak), 5K decoded then GPU-scaled to 2160 | ADR-0009 |
| 6 | Export & scratch | Memory only · OPFS scratch · `showSaveFilePicker` · IndexedDB | **OPFS scratch file (sync handle in export worker) → memory if no scratch and small → else `no_space`**; save via `<a download>`; delete on fail/cancel, after hand-over (rule from SP-storage), next export, New project, `pagehide`, and a sweep at every start | ADR-0010 |
| 6b | Rate control | VBR · CBR · two-pass | Quality levels VBR (table), size targets CBR + one corrective pass only if over; estimate refined by a ≤ 3 s calibration encode; floors table in `architecture.md` (checked against F-015.AC2) | ADR-0010 |
| 6c | GIF / WAV | gifenc (MIT) · own GIF encoder · other GIF libs | **gifenc** (small, stable), alternating delays for timing; **own WAV writer** | ADR-0010 |
| 7 | State/undo | Snapshots (suite) · command/inverse · Immer | **Suite snapshots** + structural sharing; ≥ 200 steps, up to 500 under 32 MB; `File` refs kept while history can restore a source | ADR-0011 |
| 8 | Fonts | — | **Sans = Manrope 700 (shared with UI), Display = Anton, Serif = Playfair Display 700, Rounded = Nunito 800**, all OFL with `vietnamese` subsets (verified on Fontsource); alternates Oswald / Lora / Quicksand / Baloo 2; Bebas Neue excluded (no Vietnamese) | ADR-0012 |
| 8b | Music pack | AAC-LC M4A 128 kbps · Opus | **AAC-LC M4A 128 kbps, −16 LUFS, 8–10 tracks ≤ 10 MB**; Opus if SP-codec shows universal decode. Candidate CC0 sources: FreePD, OpenGameArt (CC0 filter), Free Music Archive (CC0 filter), Wikimedia Commons (CC0/PD), Musopen (PD recordings) | ADR-0013 |
| 9 | Touch timeline (D-013) | — | Own scroll physics on canvas; playhead = centre; seeks coalesced; half-view padding; gesture arbitration is a design-review item | architecture.md |
| 10 | Environments & headers | `connect-src 'none'` + tricks · `'self'`; staging or not | **`connect-src 'self'`** (manifest-only `fetch`, lint + e2e); **no COOP/COEP isolation**; local dev (+ mkcert LAN HTTPS for phones), local release preview, **staging `clip-maker-staging.tarokit.app`**, production `clip-maker.tarokit.app` | ADR-0014 |
| 11 | Modules | — | 19 modules (table in `architecture.md`), pure core (MOD-Core, MOD-Plan) shared by all threads | modules/ |

## 4. Risks
Ranked list with mitigations in `architecture.md` "Risks". Top five: M-1 size (owner-accepted),
codec matrix, phone memory, phone GPU speed + encoder colour fidelity, MPL decision.

## 5. Spike plan (ordered by risk and dependency)
Shared prep (0.5 d, before spike 1): fixture corpus — owner records on the reference phones
(iPhone HEVC SDR + HLG 4K, Android H.264 1080p/4K), a macOS 5K screen recording, a long-GOP
screen recording, OBS MKV/WebM, audio in each RULE-01 format, damaged/over-limit files; a 24-patch
chart clip and clap track generated by our own browser encoder; a 4 GB file built by our own script.
Checksummed, outside git.

| # | ID | Exact question | Prototype scope | Measurement | Pass criteria | Devices / browsers | Box | Depends |
|---|---|---|---|---|---|---|---|---|
| 1 ⛔ | SP-codec | Which decode and encode configs does each target actually support, and do `isConfigSupported` answers hold under a real encode? Which codecs does each Playwright engine have? | Probe page: decode configs (H.264 B/M/H, HEVC, VP8, VP9, AV1) at 1080/2160; encode H.264/VP9/VP8 at 480–2160 × 24/25/30/60; AAC/Opus encode; AAC/Opus/MP3/FLAC/Vorbis decode; 2 s real encode per passing config; HDR VideoFrame formats | Matrix JSON per device; probe duration | Every NFR-12 target has a defined video output (or RULE-22 refusal for the Gecko Android browser); false positives found and handled by trial encode; probe ≤ 300 ms; Opus decode universal or not (decides music format) | Chrome/Edge, Firefox, Safari 26 (macOS); iOS Safari 26; Chrome Android; Firefox Android; Playwright chromium, chrome channel, webkit | 1.5 d | prep |
| 2 ⛔ | SP-license | Is mediabunny correct and small enough on our corpus, and what would the permissive path really cost? | Two adapters behind the MOD-Container interface: (A) mediabunny read + write; (B) mp4box.js read MP4/MOV + mp4-muxer write; list the gaps (WebM/MKV, MP3, Ogg, FLAC, ADTS readers; Ogg writer) with LOC estimates | Corpus pass/fail (rotation, edit lists, VFR, moov-at-end, fragmented, damaged); gzip size tree-shaken; peak memory reading the 4 GB file | (A) reads 100 % of the corpus and writes MP4/WebM/M4A/Ogg that play in all three engines, ≤ 70 KB gzip for the parts we use; written report with (B)'s cost → **owner decision** | Chrome + Safari desktop (Firefox for playback checks) | 2 d | prep |
| 3 | SP-frame | Do module workers, `OffscreenCanvas` WebGL2, `AudioWorklet`, WebCodecs, OPFS sync handles, `<a download>` and full screen all work inside the portal's sandboxed frame under our CSP? | Local stub host (other localhost origin) with the portal's sandbox + permissions; the tool's headers | Pass/fail per feature × engine; OPFS quota in frame vs standalone | All work embedded and standalone, or a fallback is written into ADR-0003/0010; confirms no COOP/COEP needed | Chromium, WebKit (Playwright) + manual Firefox, iOS Safari | 1 d | 1 |
| 4 ⛔ | SP-compositor | Can one `paint(plan)` in a worker drive both preview and export, in sync with the audio clock, and seek fast? | Engine worker with 2 decoders, cross-fade, placement, text bitmap; preview at display size; export at 1080p through VideoEncoder + adapter A; scripted scrub | Frame index diff (preview at export size vs decoded export); A/V clap offset across a 10-min export; seek latency p95 | Each export frame within 1 frame and 2 px of preview; drift < 40 ms over 10 min; seek p95 ≤ 150 ms on phone-recorded sources (long-GOP worst case recorded) | Laptop Chrome + Safari; iPhone; Android | 3 d | 1, 2 |
| 5 ⛔ | SP-gpu-color | Does the full RULE-08 chain + looks hold frame rate on phones, keep precision, and survive the encoder's RGB→YUV? | All 12 adjustments + look + vignette + grain + blur background in the compositor; CPU reference; 24-patch chart through preview and export; half-float vs recompute-taps | fps during 30 s playback with 3 texts + music; ΔE00 per patch; RULE-08 ramp bars; look file sizes; output colour tags | ≥ 30 fps laptop, ≥ 24 fps phones at 1080p; ΔE00 mean < 2, max < 4; ramp bars met; 16 looks ≤ 1.2 MB; sets the slow-device threshold | Laptop Chrome/Safari/Firefox; iPhone; Android | 2 d | 4 |
| 6 ⛔ | SP-audio | Does the own mixer + worklet play glitch-free and match export exactly? Is the limiter ceiling safe after AAC/Opus? | Audio worker mixer (3 voices, fades, cross-fade, volume), limiter, worklet over MessagePort; export render to AAC/Opus/WAV; Web Audio graph variant for comparison | Underruns over 10 min; sample diff vs offline reference; decoded true peak; CPU per voice; memory | 0 underruns over 10 min on phones with the screen on; export sound = reference within float rounding; audio-only vs video sound ≤ 1 ms; decoded true peak ≤ −1 dBTP (fixes the margin) | Laptop 3 engines; iPhone; Android | 2 d | 1, 2 |
| 7 ⛔ (F-005) | SP-timestretch | Is our own WSOLA good enough for speech and music at 0.25×–4×, and cheap enough? | WSOLA with sync points; phase-vocoder variant; Signalsmith (WASM) as reference only, locally | 440 Hz tone at each quick speed; blind listening (owner + 1) on speech, music, mixed at 0.5×/2×; CPU % per voice; preview vs export identity after seeks | 440 Hz ± 1 % at all speeds (F-005.AC2); listening rated acceptable at 0.5×/1.5×/2× for speech and music; ≤ 15 % of one phone core per voice; identical output from any seek | Laptop; iPhone; Android | 1.5 d | 6 |
| 8 ⛔ | SP-mem-phone | Do the NFR-05 fixtures preview and export on phones without the page being killed? | Engine + export with bounded caches; 10-min 1080p project, 2-min project from 4K HEVC, 5K screen recording, 4 GB source vs 100 MB source | Peak memory via remote inspector (iOS: Web Inspector timelines; Android: Chrome memory), crash count over 5 runs | 0 kills in 5 runs each; peak ≤ 600 MB; 4 GB within 10 % of 100 MB; 5K plays at ≥ 24 fps or is recorded as a known limit | iPhone (4 GB); Android | 2 d | 4, 6 |
| 9 | SP-speed | Does export reach NFR-04? | NFR-04 fixture export end-to-end | Wall time incl. set-up, median of 3 | ≤ 75 s laptop, ≤ 150 s phones; else profile (readback, back-pressure, hardware flags) | Laptop Chrome/Safari/Firefox; iPhone; Android | 1 d | 4, 5, 6 |
| 10 | SP-storage | Can scratch be written fast and deleted without ever breaking the save? How much room in a frame? | OPFS writer in export worker; save via blob URL of the OPFS `File`; delete at various delays; `pagehide` + start-up sweep; quota embedded vs standalone | Save integrity vs deletion delay; write MB/s; `estimate()` in frame | A deletion rule that never corrupts a save on any engine; sweep removes leftovers; quota figures recorded → F-019.R7 behaviour | Chrome, Safari, Firefox desktop; iOS; Android; embedded + standalone | 1 d | 3 |
| 11 | SP-ios | What happens when the page is hidden or the phone locks mid-export, and how do saves land? | Export with app switch / lock at 30 %; AudioContext interruption during playback; downloads of MP4/GIF/M4A/WAV | Outcome per case; time to detect | Interruption detected → COPY-error.export_interrupted within 5 s of return, project intact, scratch empty; every format saves to Files (and offers Photos where the OS does) | iPhone Safari 26 (standalone + embedded); Android Chrome | 1 d | 10 |
| 12 | SP-size-target | Are the floors sensible and the estimate within ±25 %? Is the target ever exceeded? | Rate control + estimate + calibration encode on all fixtures × resolutions × quality levels and targets 8/10/25/50 MB | Estimate error; final size vs target; visual check at floors | ±25 % on every fixture/quality; never above target (with the corrective pass); floors look acceptable to the owner | Laptop Chrome/Safari/Firefox; one phone | 1.5 d | 9 |
| 13 | SP-hdr | Is HDR→SDR identical in preview and export on each engine, and affordable? | Own shader from 10-bit planes; engine fallback | Preview vs export ΔE on HLG/PQ fixtures; `copyTo` cost per 4K frame | Meets NFR-08 between preview and export on every engine; 4K HLG preview ≥ 24 fps on iPhone, else engine path there | iPhone, Android, Safari + Chrome desktop | 1 d | 5 |

Total ≈ 20.5 days of spikes (≈ 15 blocking). 1–3 can run in parallel on day 1; 4–7 follow; 8–13
overlap the start of the build (MOD-Core, MOD-Plan, MOD-Project and the UI shell need no spike).

## 6. Decisions needed from the owner
**Legal / money**
1. **MPL-2.0 exception for mediabunny** (D-003 follow-up) — after SP-license: approve ADR-0005
   (unmodified, pinned, notice + source link) or choose the permissive path (+2–3 weeks, two
   deprecated dependencies). Recommendation: approve.
2. **Music pack** — approve the candidate CC0 sources (FreePD, OpenGameArt CC0, FMA CC0, Wikimedia
   Commons CC0/PD, Musopen PD) and who picks and listens to the 8+ tracks; each needs a saved
   licence record. No paid sources.
3. **Google Chrome as a dev-only test browser** (proprietary freeware, DEP-34) so H.264/AAC paths
   are automated; otherwise those paths are manual only.
4. **Staging environment** (`clip-maker-staging.tarokit.app`, second wrangler environment, free
   tier) — recommended for phone codec checks over real HTTPS; the suite had none.
5. **Reference devices** — which physical laptop, iPhone and Android the NFRs are measured on (A1).

**Product / security**
6. **Gecko desktop output**: MP4 (H.264 + Opus) — recommended — or WebM (VP9 + Opus).
7. **CSP `connect-src 'self'`** instead of the suite's `'none'` (own files only, manifest-only
   `fetch`). Recommended; the portal contract allows it.
8. **WebAssembly fallback** for time-stretch (`'wasm-unsafe-eval'`) only if our WSOLA fails —
   approve the possibility now or require a new decision then.
9. **Typeface picks** (Anton / Playfair Display / Nunito with Manrope) — design sign-off on
   Vietnamese marks.
10. **Portal catalog permissions** for Clip Maker: `downloads`, `dialogs`, `fullscreen`, optional
    `popups` (portal change request).

## 7. Spec issues found (not edited; for a spec change)
- **S-1 INV-01 / F-015.R7 / F-015.AC7**: "scratch space is deleted when its export ends" — after
  a successful export the browser may still be reading the scratch file for the save; deleting at
  once can break the save. Proposed wording: "deleted when the export fails or is cancelled, and
  after a success once the browser has taken the file — at the latest when the page closes — and
  anything left is deleted the next time the tool opens". AC7 then inspects after the hand-over.
- **S-2 F-019.R7**: "if the browser gives the embedded tool too little storage, the export is
  refused" — with ADR-0010 an export can still run in memory when it is small; suggest "too little
  storage or memory".
- **S-3 RULE-15 Success / D-018**: on the `<a download>` path no engine reports a cancelled save
  dialog, so every export counts once handed over; F-015.AC13 is only testable where the browser
  reports it (File System Access, not used in M-1). Suggest marking AC13 "where detectable".
- **S-4 F-011.AC5**: "true peak of the decoded export ≤ −1 dBTP" — lossy encoders can overshoot
  the limiter; the design uses a lower internal ceiling (SP-audio). No spec change unless the owner
  prefers −1 dBTP measured before encoding.
- **S-5 NFR-01 / NFR-02**: the first visit downloads ≈ 12 MB (music); fine by NFR-02's "continues
  in the background", but on metered phone data it is noticeable; F-020's explanation could
  mention it.
- **S-6 F-002.R7**: full screen inside the portal needs the `fullscreen` frame grant, which
  RULE-17's "Frame grants" does not list (the fallback "maximised within the page" covers it);
  consider adding it as optional to RULE-17.
- **S-7 NFR-12 / RULE-22**: the Gecko Android browser lacks the codec API, so it always gets
  SCR-Unsupported — consistent with the vision brief, worth stating in F-023 edge cases.

## 8. Assumptions
A1–A6 in `architecture.md`. Plus: the owner's machine is a Mac (paths), so WebKit desktop and
iOS checks are available; Firefox desktop runs manually (Playwright Firefox does not launch on the
owner's machine, suite finding); browser codec patents are the vendors' (vision brief).

## Sources (checked 2026-11-03)
- npm registry: mediabunny 1.65.0 MPL-2.0 (2026-10-30); mp4box 2.5.0 BSD-3-Clause (2026-10-25);
  mp4-muxer 5.2.2 / webm-muxer 5.1.4 MIT, deprecated "superseded by Mediabunny"; gifenc 1.0.3 MIT;
  signalsmith-stretch 1.3.2 MIT (WASM/AudioWorklet); soundtouchjs 0.3.0 LGPL-2.1.
- [Mediabunny formats and codecs](https://mediabunny.dev/guide/supported-formats-and-codecs),
  [Mediabunny introduction](https://mediabunny.dev/guide/introduction),
  [Mediabunny v1.36.0 release (AAC encoder polyfill for Firefox)](https://github.com/Vanilagy/mediabunny/releases/tag/v1.36.0),
  [Mediabunny AAC encoder extension](https://mediabunny.dev/guide/extensions/aac-encoder),
  [Remotion: encodable audio codecs (Firefox: Opus only)](https://www.remotion.dev/docs/web-renderer/get-encodable-audio-codecs).
- [caniuse WebCodecs](https://caniuse.com/webcodecs),
  [web-features WebCodecs](https://web-platform-dx.github.io/web-features-explorer/features/webcodecs),
  [Mozilla bug 1746557 (Android WebCodecs)](https://bugzilla.mozilla.org/show_bug.cgi?id=webcodecs),
  [MDN AudioEncoder.isConfigSupported](https://developer.mozilla.org/docs/Web/API/AudioEncoder/isConfigSupported_static),
  [MDN browser-compat AudioDecoder (Safari 26)](https://chromium.googlesource.com/external/github.com/mdn/browser-compat-data/+/73d346309ee9d8be7e32fda8ff574d4c79dd4c51/api/AudioDecoder.json),
  [Chromium audio/video (proprietary codecs only in Chrome)](https://chromium.org/audio-video),
  [MDN origin private file system](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system).
- Fontsource API (subsets/licences of Manrope, Anton, Oswald, Playfair Display, Lora, Nunito,
  Quicksand, Baloo 2, Bebas Neue).
- [FreePD licence mirror (CC0 1.0)](https://a.ocv.me/pub/stuff/music/freepd/README.md),
  [Kevin MacLeod / Incompetech (CC-BY, excluded)](https://Www.Wikipedia.org/wiki/Incompetech),
  [gifenc](https://github.com/mattdesl/gifenc).
