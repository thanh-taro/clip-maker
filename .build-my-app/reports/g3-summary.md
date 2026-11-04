# G3 summary — Clip Maker architecture after the spikes (2026-11-04)

**Ask at G3:** accept ADR-0001 … ADR-0016 as amended (each affected ADR has an "Outcome (spikes,
2026-11-04)" section; ADR-0005 is already accepted, D-042), and decide the spec changes in
`g3-spec-changes.md` (SC-1 … SC-11).

## Stack (one paragraph)
Static single-page app on Cloudflare static assets, embedded by the portal (no cross-origin
isolation) and standalone; the suite baseline (Preact + signals, strict TypeScript, Vite, pnpm,
EN/VI copy, host contract, hand-written service worker). Media engine on browser features only:
**WebCodecs** for every decode and encode with a ≤ 300 ms minimal start-up probe and a lazy export
grid; **mediabunny 1.65** (MPL-2.0 exception, unmodified, writer only in the export worker) to read
and write files in pieces; **one WebGL2 `paint`** in a worker for preview, thumbnails and exports,
with a half-float grade intermediate, 33³ look tables and HDR→SDR by the engine's own conversion;
**our own TypeScript mixer** (true-peak limiter + verify-and-trim on lossy exports) and **own WSOLA**
time-stretch, played through an AudioWorklet whose clock leads the picture; an **export worker +
export-audio worker** streaming to an OPFS scratch file that is deleted 10 s after hand-over and
swept with Web Locks. CSP `connect-src 'self'`, no WebAssembly (D-032).

## Spike verdicts
| Spike | Verdict | Key numbers |
|---|---|---|
| SP-codec | adapt | minimal probe 32–54 ms; Chrome/Safari/iPhone → MP4 H.264+AAC, Firefox → H.264+Opus (D-033); Safari macOS H.264 only in realtime mode (3.9×); WebKit AAC description fix; FLAC false positive |
| SP-license | adopt (D-042) | 26/26 corpus; 108 KB gzip (read 73 / write 48); +77 MB reading 4 GB; permissive path 4–8 weeks |
| SP-frame | adopt | every feature embedded + standalone, no isolation, 0 stray CSP violations; WebKit frame quota 1/10; iOS worklet CORS |
| SP-compositor | adopt + amendments | 720/720 frames at offset 0; A/V +0.04 ms, 0 drift over 10 min; iPhone seek p95 58 ms (1 s GOP), coarse 119 ms (10 s GOP); AAC priming 44 ms |
| SP-gpu-color | adopt + amendments | iPhone 29.9 fps full chain (1080p and 4K); ΔE00 ≤ 0.52 / 1.65 (iPhone); looks 4–15 KB; slow threshold 30 fps; 8-bit ramp bars impossible (SC-1) |
| SP-audio | adapt | 0 underruns 10 min; bit-exact vs reference; codec overshoot 2–3 dB → verify-and-trim; 400 ms lead |
| SP-timestretch | adopt WSOLA | 440 Hz ± 0.001 %; bit-exact across seeks and engines; iPhone 0.35–0.39 % core; listening 3.67/5 |
| SP-mem-phone | adopt + amendments | 4 GB = 100 MB (+1.8 %/+3.4 %); 0 kills (2 iPhone runs); iPhone runs 2–3 × 4K HEVC + 4K encoder together; 10-min 1080p export 1.9×; 5K 14 fps (M3); `VideoFrame` wrap ≈ 70 % of phone export time |
| SP-speed | adopt + amendments | NFR-04 fixture: Chrome 20 s, WebKit 44 s, **iPhone 34.4 s** (≤ 75/150 s); software H.264 0.8× |
| SP-storage | adopt | delete 10 s after save: 0 failures (WebKit loses saves deleted < 80 ms); Web Locks sweep 48/48; `pagehide` delete never completes |
| SP-ios | adopt + amendments | lock/app switch interrupt exports, message 3.1 s after return, project intact, scratch 0; WebGL context lost after 60 s lock; silent switch mutes audio |
| SP-size-target | adapt | 3 × 2 s estimate ≤ 6 % (Chrome) / 14 % (WebKit); target-rate pre-check 0 misses; encoder minimums beat floors on high motion; 480p = 848 |
| SP-hdr | adapt (engine path) | HDR frames opaque on macOS, tone-mapped by iOS decoder; preview vs export ΔE00 ≤ 0.43 / 1.40; own 10-bit shader dropped |

## Remaining risks (ranked)
1. **Phone export speed at 4K** (0.43× real time): `VideoFrame` wrap dominates. Optimise early in the build, with 1080p as the default output. Phone peak MB is still unmeasured (QA).
2. (Retired by the iPhone re-run: decoder concurrency and encoder stalls.)
3. **Late-audio muxing** without buffering video (hybrid schedule) — to verify in the first export
   integration test.
4. **Colour tags / full range** in third-party players — owner player check pending.
5. **Coverage gaps**: Android untested (D-037), Firefox Opus verify loop and HDR, PQ sources.
6. Size-target floors pending visual check; Safari realtime-mode rate accuracy.

## Open items before or at G3
- **SP-mem-phone iPhone re-run:** DONE 2026-11-04. No kills, decoder concurrency OK, the 10-minute export works.
- **Embedded share** pending the portal change (`portal-change-request.md`: `share` permission and
  catalog entry); download-only embedded until then. Spec SC-9 decides whether Share exists at all.
- **Android** untested (Chrome Android; Firefox Android → SCR-Unsupported) until a device is
  borrowed (D-037).
- **HEVC 4K concurrency** — see risk 1; desktop engines ran 3 concurrent 4K HEVC decoders fine.
- Owner checks: floor stills (300/600/1,000 kbps), player check of the chart MP4, optional second
  listener for WSOLA, silent-switch choice (SC-10).
- Music curation (D-034) and look authoring (DEP-13) are build-phase tasks.
