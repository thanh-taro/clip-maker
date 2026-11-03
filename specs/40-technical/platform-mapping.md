# Platform mapping

How the neutral wording of the specs maps to browser platform features. Targets: the NFR-12 list
in `architecture.md` (A2), embedded in the portal's frame and standalone. Items marked (spike) are
confirmed by the spikes in `architecture.md`.

## Device support and codecs
| Spec wording | Platform mapping | Notes / fallback |
|---|---|---|
| "The device can decode" (rules.md conventions, RULE-01) | `VideoDecoder.isConfigSupported` / `AudioDecoder.isConfigSupported` with the container's real config, then decoding the first frame/window during probing | Refusal → COPY-reason.codec (F-023.R2) |
| Start-up check (RULE-22, F-023) | Engine worker: decode probes (H.264, HEVC, VP8, VP9, AV1), `VideoEncoder.isConfigSupported` per codec × RULE-15 size × rate, `AudioEncoder.isConfigSupported` (AAC-LC `mp4a.40.2`, Opus), WebGL2 context + required features, timed render | Missing API (e.g. the Gecko Android browser) → SCR-Unsupported (spike SP-codec) |
| Slow-device threshold (RULE-22) | Timed full-chain render < 24 fps equivalent at 1080p → COPY-notice.slow_device | Tuned by SP-gpu-color |
| Output and fallback order (RULE-15) | MP4 H.264+AAC → MP4 H.264+Opus → WebM VP9+Opus → WebM VP8+Opus (ADR-0004) | Named by COPY-export.format_note |
| Audio-only fallback (RULE-16) | AAC-LC in M4A → Opus in Ogg; WAV always (own writer) | |
| Resolutions offered (RULE-15) | `VideoEncoder.isConfigSupported` at each size and the project rate; ≤ the largest source's shorter side after rotation and RULE-02 scale-down | A failed trial encode drops the format for the session |
| Photos (RULE-01) | `createImageBitmap(file, { imageOrientation: 'from-image' })`; AVIF only if a probe image decodes; GIF first frame | HEIC refused by magic bytes |

## Getting media in
| Spec wording | Platform mapping | Notes |
|---|---|---|
| Pick, drop, paste (F-001.R1) | Hidden `<input type="file" multiple>`; `dragenter/dragover/drop` with `webkitGetAsEntry()` to skip folders (COPY-reason.folder); `paste` with `clipboardData.files` only | Text/links never fetched (F-001.AC10) |
| Type decided by content (RULE-01) | Magic bytes of `file.slice(0, 64)`, then the container reader | Name and MIME ignored |
| Protected files (RULE-01) | Encrypted tracks (`encv`/`enca`, `ContentEncryption`) detected by the reader → COPY-reason.protected | |
| Read piece by piece (F-001.R7, NFR-05) | Container reader over `Blob.slice()`; no `arrayBuffer()` of whole files | 4 GB fixture (SP-mem-phone) |
| Rotation, VFR, edit lists | Read from the container (track matrix, sample times, edit lists) by MOD-Container | Spike SP-license corpus |
| 5K scaled to 2160 (RULE-02, D-012) | Decoded at full size, sampled down in the compositor | Spike SP-mem-phone |
| HDR to standard range (RULE-01, D-014) | `VideoFrame.colorSpace` (`pq`/`hlg`/`bt2020`) → `copyTo` 10-bit planes → own shader; else engine conversion on upload | Spike SP-hdr |
| Thumbnails and waveforms (CMP-MediaPanel, CMP-Timeline) | Analysis worker: keyframe decodes → small `ImageBitmap`s; audio windows → min/max peaks | Bounded caches (ADR-0009) |

## Preview and playback
| Spec wording | Platform mapping | Notes |
|---|---|---|
| Preview picture (F-002.R1) | `<canvas>` → `transferControlToOffscreen()` → engine worker WebGL2 | Fallback: main-thread WebGL2 (ADR-0003) |
| Picture and sound together (F-002.R2) | `AudioContext({ sampleRate: 48000 })` created/resumed in the Play gesture; `AudioWorkletNode` playing blocks from the audio worker over a `MessagePort`; `getOutputTimestamp()` + `outputLatency` → project time; `requestAnimationFrame` ticks to the worker | No `SharedArrayBuffer` |
| Scrub / seek (F-002.R3, NFR-03) | Coalesced seeks (latest wins); keyframe seek + decode forward; cached thumbnail first | Spike SP-compositor |
| Full screen (F-002.R7) | `element.requestFullscreen()`; refused (no `fullscreen` grant, iPhone Safari on non-video elements) → maximise inside the page | Host grant `allow="fullscreen"` |
| Speed with pitch kept (RULE-06) | Own WSOLA in the audio worker | Spike SP-timestretch |
| Mix and limiter (RULE-12) | Own mixer + 4× oversampled true-peak limiter | Spike SP-audio |
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

## Getting results out
| Spec wording | Platform mapping | Notes |
|---|---|---|
| Encode (RULE-15, RULE-16) | `VideoEncoder` / `AudioEncoder`; `new VideoFrame(offscreenCanvas, { timestamp, duration })` | Own BT.709 conversion if colour fails (SP-gpu-color) |
| Write the file | Container writer to a streaming target | |
| Scratch space during export (F-015.R7, INV-01) | Origin-private file system (`navigator.storage.getDirectory()`), `createSyncAccessHandle()` in the export worker; `navigator.storage.estimate()` for room | Partitioned and possibly small in a frame (SP-storage) |
| Save (RULE-15 Success) | `URL.createObjectURL(file or blob)` + `<a download="clip-YYYYMMDD-HHMMSS.ext">` click; revoke after the scratch rule | Needs `allow-downloads` in the frame; a cancelled save dialog is not detectable on this path (D-018) |
| Cancel within 1 s (NFR-11) | `worker.terminate()` + scratch delete | |
| Page hidden during export (F-015 edge case) | `visibilitychange` + progress heartbeat; encoder error after hiding → COPY-error.export_interrupted | Spike SP-ios |
| GIF (RULE-16) | gifenc per frame (256 colours), delays in centiseconds alternating to keep timing | |
| WAV (RULE-16) | Own RIFF writer, 16-bit PCM | |
| Leave-page warning (F-018.R1) | `beforeunload` with `preventDefault()` only while unexported | The WebKit engine never shows it from a cross-origin frame (suite finding); not detectable (F-018 edge case) |

## Host, offline, privacy
| Spec wording | Platform mapping | Notes |
|---|---|---|
| Theme and language in the address; messages; ready (RULE-17, RULE-18) | Suite boot script, `message` listener checking `event.origin` and `event.source === window.parent`, one `postMessage({ type: 'taro:ready' }, hostOrigin)` | ADR-0002 |
| Who may embed (NFR-09) | `Content-Security-Policy: frame-ancestors <HOST_ORIGINS>` | ADR-0014 |
| No network, own files only (NFR-01) | CSP `connect-src 'self'` + lint ban + manifest-only `fetch` in MOD-Assets + e2e request log | ADR-0014 |
| Offline after one visit (F-021) | `sw.js` precaching `asset-manifest.json` | ADR-0015 |
| Source link in a new tab (F-020.R3) | `<a target="_blank" rel="noopener noreferrer">` | Needs `popups` grant when embedded |
| Licence notices in the tool (F-020.R4) | `third-party-notices.txt` bundled into the page at build | No request |
| Numbers and durations (RULE-18) | `Intl.NumberFormat`, `Intl.PluralRules`, `Intl.DurationFormat` where present | |
