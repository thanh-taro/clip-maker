# Platform mapping

How the neutral wording of the specs maps to browser platform features. Targets: the NFR-12 list
in `architecture.md` (A2), embedded in the portal's frame and standalone. Items marked (spike) are
confirmed by the spikes in `architecture.md`. Updated with the spike outcomes on 2026-11-04 (see the
"Outcome" sections of ADR-0003 … ADR-0016).

## Device support and codecs
| Spec wording | Platform mapping | Notes / fallback |
|---|---|---|
| "The device can decode" (rules.md conventions, RULE-01) | `VideoDecoder.isConfigSupported` / `AudioDecoder.isConfigSupported` with the container's real config, then decoding the first frame/window during probing | Refusal → COPY-reason.codec (F-023.R2) |
| Start-up check (RULE-22, F-023) | Codec probe on the **main thread**, minimal set only (≤ 300 ms; measured 32–54 ms): decode probes at 1080p (H.264, HEVC, VP8, VP9, AV1), one `VideoEncoder.isConfigSupported` per codec at 1080p30, `AudioEncoder.isConfigSupported` (AAC-LC `mp4a.40.2`, Opus), WebGL2 context; ≤ 4 calls at once, each answer bounded by 1 s (no answer = not supported). It runs on the main thread because the opening screen is decided there before any worker starts (an unsupported device starts none) and the interfaces answer the same in every thread. Then the **engine worker's** effects check answers twice: "drawn" after the first warm-up frame's GPU sync (≈ 100 ms) decides the screen and lets media in; the timed result only gives the slow-device notice. No engine answer within 3 s (drawn) or 10 s (timed) counts as slow, never as unsupported | Missing API (e.g. the Gecko Android browser) → SCR-Unsupported, with every failed check listed (the probe still runs). Effect chain not drawable → SCR-Unsupported and every worker stops. Files picked before "drawn" are queued until it arrives (F-001). The size × rate grid is probed when the export panel opens (SP-codec) |
| Slow-device threshold (RULE-22) | Effects check: full RULE-08 chain + a look + Blur at 1080p on a generated bitmap, 5 warm-up + 30 timed frames, one GPU sync at the end; **below 30 fps (> 33 ms per frame)** → COPY-notice.slow_device | SP-gpu-color: check ≥ 33 fps always played ≥ 24 fps; iPhone 14 Pro 128–140 fps. A source decoding slower than real time is classed slow too (notice pending the RULE-22 spec change) |
| Output and fallback order (RULE-15) | MP4 H.264+AAC → MP4 H.264+Opus → WebM VP9+Opus → WebM VP8+Opus (ADR-0004) | Measured: Chrome, Safari, iPhone → MP4 H.264+AAC; Firefox → MP4 H.264+Opus (D-033). Named by COPY-export.format_note |
| Audio-only fallback (RULE-16) | AAC-LC in M4A → Opus in Ogg; WAV always (own writer) | |
| Resolutions offered (RULE-15) | `VideoEncoder.isConfigSupported` at each size and the project rate (probed when the export panel opens); ≤ the largest source's shorter side after rotation and RULE-02 scale-down; dimensions even with the long side a multiple of 16 (480p = 848 × 480) | A failed trial encode drops the format for the session; Chrome resamples widths not divisible by 16 (SP-size-target) |
| Photos (RULE-01) | `createImageBitmap(file, { imageOrientation: 'from-image' })`; AVIF only if a probe image decodes; GIF first frame | HEIC refused by magic bytes |
| Encoder mode | Trial encode with `latencyMode: 'quality'`; no chunk within 2 s → `'realtime'`, recorded per engine | Safari macOS H.264 works only in realtime (SP-codec owner run) |
| "The device can decode" — false positives | First packets decoded for real on add | WebKit FLAC (incl. iPhone) passes the probe, then fails → COPY-reason.codec |

## Getting media in
| Spec wording | Platform mapping | Notes |
|---|---|---|
| Pick, drop, paste (F-001.R1) | Hidden `<input type="file" multiple>`; `dragenter/dragover/drop` with `webkitGetAsEntry()` to skip folders (COPY-reason.folder); `paste` with `clipboardData.files` only | Text/links never fetched (F-001.AC10) |
| Type decided by content (RULE-01) | Magic bytes of `file.slice(0, 64)`, then the container reader | Name and MIME ignored |
| Protected files (RULE-01) | Encrypted tracks (`encv`/`enca`, `ContentEncryption`) detected by the reader → COPY-reason.protected | |
| Read piece by piece (F-001.R7, NFR-05) | Container reader over `Blob.slice()`; no `arrayBuffer()` of whole files | 4 GB fixture (SP-mem-phone) |
| Rotation, VFR, edit lists | Read from the container (track matrix, sample times, edit lists) by MOD-Container | Spike SP-license corpus |
| 5K scaled to 2160 (RULE-02, D-012) | Decoded at full size, sampled down in the compositor; grade intermediates at the placed target size | Known limit: 5120 × 2880 previews below 24 fps on the M3 (14 fps Chrome); export correct (SP-mem-phone) |
| HDR to standard range (RULE-01, D-014) | The engine's conversion on upload: `texImage2D(VideoFrame)` into the `srgb` working space, the same call in preview and export; the decoded frame's colour space is trusted over the track's | macOS Chrome/WebKit frames are opaque (`format: null`); iOS decodes HLG to SDR NV12 itself. Preview vs export ΔE00 ≤ 0.43 mean / ≤ 1.40 max (SP-hdr). PQ, Firefox, Android untested |
| Thumbnails and waveforms (CMP-MediaPanel, CMP-Timeline) | Analysis worker: keyframe decodes → small `ImageBitmap`s; audio windows → min/max peaks | Bounded caches (ADR-0009) |
| Frame for a time (INV-02, NFR-08) | Presentation time from the container index (`getPacket(t + 2 µs)`), interval `[ts, next ts)`; open-GOP leading pictures dropped after a restart; 12 packets fed ahead | Real iPhone HEVC (B-frames, open GOP) — SP-hdr, SP-mem-phone |
| Phone decoder budget | Up to 3 concurrent decoders (4K included) plus an encoder; `Decoder failure` on an extra session → sequential overlap fallback | iPhone 14 Pro `dec.html`: 2–3 × 4K HEVC + 4K encoder OK (SP-mem-phone re-run) |

## Preview and playback
| Spec wording | Platform mapping | Notes |
|---|---|---|
| Preview picture (F-002.R1) | `<canvas>` → `transferControlToOffscreen()` → engine worker WebGL2 | Fallback: main-thread WebGL2 (ADR-0003) |
| Picture and sound together (F-002.R2) | `navigator.audioSession.type = 'playback'` where present, then `AudioContext({ sampleRate: 48000 })` created/unlocked in the first user gesture; `AudioWorkletNode` playing blocks from the audio worker over a started `MessagePort` with 400 ms lead; `getOutputTimestamp()` carried forward to now → project time (fallback `currentTime − outputLatency − baseLatency`); `requestAnimationFrame` ticks to the worker | No `SharedArrayBuffer`. `resume()` bounded (2 s), `state`/`statechange` are the truth; iOS mutes Web Audio on the silent switch without the playback session (SP-ios) |
| Scrub / seek (F-002.R3, NFR-03) | Coalesced seeks (latest wins); coarse-then-exact (nearest decoded keyframe or cached frame first, then keyframe seek + decode forward); ~1 frame/s preview-size cache for keyframe spacing > 2 s | iPhone p95: 58 ms (1 s GOP); 10 s GOP exact 428 ms, coarse 119 ms (SP-compositor) |
| Full screen (F-002.R7) | `element.requestFullscreen()`; refused or absent (no `fullscreen` grant; iPhone Safari has no page full screen, confirmed) → maximise inside the page | Host grant `allow="fullscreen"` |
| Speed with pitch kept (RULE-06) | Own WSOLA in the audio worker (40 ms Hann, 20 ms hop, ± 12 ms search, pinned sync frame each 1 s, 1× bypass) | 440 Hz within 0.001 %; iPhone 0.35–0.39 % of a core per voice (SP-timestretch) |
| Mix and limiter (RULE-12) | Own mixer + 4× oversampled true-peak limiter (−1.5 dBTP, 32 taps per phase); lossy exports verified after decoding and trimmed (≤ 3 passes, counting the first encode) | Codec overshoot 2–3 dB measured (SP-audio, SP-speed) |
| Look thumbnails (RULE-09) | Engine worker renders small tiles with the same shader → `ImageBitmap` → `<canvas>` tiles | |
| Compare (RULE-08) | Plan flag for preview only; `\` key down/up, pointer/touch hold | Never in export plans |

## Text
| Spec wording | Platform mapping | Notes |
|---|---|---|
| Four typefaces with Vietnamese (RULE-11) | `@font-face` (WOFF2, `latin` + `vietnamese` `unicode-range`), `document.fonts.load` for every face at start | ADR-0012 |
| Same text in preview and export (F-010.R5) | Main-thread Canvas 2D raster at output scale → `ImageBitmap` transferred to the worker | |
| 500 user-perceived characters, NFC (RULE-11) | `Intl.Segmenter` (grapheme) in `beforeinput` and paste; `normalize('NFC')` on commit | |
| Typing and input methods | Transparent `<textarea>` over the drawn text; `compositionstart/end` | Suite approach |

## Timeline and input
| Spec wording | Platform mapping | Notes |
|---|---|---|
| Touch vs pointer per input (rules.md, D-026) | Pointer Events `pointerType` per event (`touch` vs `mouse`/`pen`) | |
| Fixed centre playhead and scroll-scrub (RULE-14, D-013) | Own scroll physics on the timeline canvas (`touch-action: none`), momentum ending on a frame start | Native scrolling cannot snap per frame |
| Hold 0.4 s then drag; pinch zoom (RULE-21) | Pointer timers and two-pointer tracking; `wheel` + `ctrlKey` for trackpad pinch | |
| Keys (RULE-20) | `keydown` with `event.code` for letters (US positions), Mod = Meta on macOS else Ctrl | |
| Number fields accept the language's decimal separator (style.md) | Text inputs (`inputmode="decimal"`) parsed with the separators from `Intl.NumberFormat(lang).formatToParts()`; unparsable → restore the shown value, no edit | Not `<input type="number">`: WebKit reads vi-VN "50,5" as 505 (build question 121); to build before F-005/F-007 |

## Getting results out
| Spec wording | Platform mapping | Notes |
|---|---|---|
| Encode (RULE-15, RULE-16) | `VideoEncoder` / `AudioEncoder`; `new VideoFrame(offscreenCanvas, { timestamp, duration })`; queue cap 4–8; stall watchdog ≥ 20 s; audio times shifted by the measured encoder delay (edit list); explicit `colr` tags | Chart ΔE00 passes everywhere, no read-back needed (SP-gpu-color); `readPixels` doubles export time (SP-speed) |
| Write the file | Container writer to a streaming target | |
| Scratch space during export (F-015.R7, INV-01) | Origin-private file system (`navigator.storage.getDirectory()`), `createSyncAccessHandle()` in the export worker; `navigator.storage.estimate()` for room (`quota − usage ≥ estimate × 1.3`); writes in ≥ 1 MB batches; names `export-<session>-<random>.part` | Chrome: same-site frame shares storage with standalone; WebKit frame quota = 1/10 of standalone (SP-frame, SP-storage) |
| Save (RULE-15 Success) | `URL.createObjectURL(file or blob)` + `<a download="clip-YYYYMMDD-HHMMSS.ext">` click, no fresh user activation needed; revoke and delete 10 s after the click | Needs `allow-downloads` in the frame; a cancelled save dialog is not detectable on this path (D-018). WebKit loses a save if the file is deleted within ~80 ms (SP-storage). iPhone: every format lands in Files |
| Share / Save to Photos (RULE-17 optional grant) | `navigator.canShare({ files })` → `navigator.share({ files: [file] })` after a tap | Embedded: the portal grants `web-share` to tools declaring `share` (portal D-072, commit 4c4ae94). Only after a user gesture, and `canShare` is checked with the real file; download stays the fallback (F-015.R9) |
| Cancel within 1 s (NFR-11) | `worker.terminate()` (export and export-audio workers) + close handle + scratch delete | |
| Scratch sweep at start (F-015.AC14) | Web Lock `clipmaker-scratch:<session>` held for the page's life; another session's file deleted only inside a granted `locks.request(…, { ifAvailable: true })` | Heartbeats rejected; `pagehide` deletion never completes (SP-storage) |
| Page hidden during export (F-015 edge case) | Wall-clock rules: hidden + 5 s without progress; or no progress within 3 s of becoming visible; or encoder/WebGL error after a hide → COPY-error.export_interrupted at detection, clean-up behind it | iOS suspends hidden pages: lock/app switch interrupt every export; message 3.1 s after return (SP-ios) |
| GPU process restart (iOS after a long lock) | `webglcontextlost` → re-create the context and re-upload resources, up to 5 tries 400 ms apart; preview always recovers, a loss mid-export fails it | SP-ios |
| GIF (RULE-16) | gifenc per frame (256 colours), delays in centiseconds alternating to keep timing | |
| WAV (RULE-16) | Own RIFF writer, 16-bit PCM | |
| Leave-page warning (F-018.R1) | `beforeunload` with `preventDefault()` only while unexported | The WebKit engine never shows it from a cross-origin frame (suite finding); not detectable (F-018 edge case) |

## Host, offline, privacy
| Spec wording | Platform mapping | Notes |
|---|---|---|
| Theme and language in the address; messages; ready (RULE-17, RULE-18) | Suite boot script, `message` listener checking `event.origin` and `event.source === window.parent`, one `postMessage({ type: 'taro:ready' }, hostOrigin)` with `hostOrigin` from `location.ancestorOrigins[0]` or `document.referrer`, checked against `HOST_ORIGINS` | ADR-0002; Firefox has no `ancestorOrigins` (SP-frame) |
| Who may embed (NFR-09) | `Content-Security-Policy: frame-ancestors <HOST_ORIGINS>` | ADR-0014 |
| No network, own files only (NFR-01) | CSP `connect-src 'self'` (D-032) + lint ban + manifest-only `fetch` in MOD-Assets + e2e request log | ADR-0014 |
| Worklet module on iOS standalone | Worklet (and worker) modules served with `Access-Control-Allow-Origin: <tool origin>` | iOS refused the same-origin worklet over CORS standalone (SP-frame) |
| Offline after one visit (F-021) | `sw.js` precaching `asset-manifest.json` | ADR-0015 |
| Source link in a new tab (F-020.R3) | `<a target="_blank" rel="noopener noreferrer">` | Needs `popups` grant when embedded |
| Licence notices in the tool (F-020.R4) | `third-party-notices.txt` bundled into the page at build | No request |
| Numbers and durations (RULE-18) | `Intl.NumberFormat`, `Intl.PluralRules`, `Intl.DurationFormat` where present | |
