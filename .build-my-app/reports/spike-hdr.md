# Spike SP-hdr

Frame: row 13 of the spike table in `architecture-proposal.md` §5. Checks ADR-0007 §4 (HDR to standard
range by our own shader from the decoded 10-bit planes, engine conversion as the per-engine fallback),
D-014 (HDR converted the same way in preview and every export), RULE-01 (outputs are SDR BT.709) and
NFR-08 (preview vs export: mean ΔE00 < 2, max < 4). Builds on SP-gpu-color's compositor and SP-speed's
export path. SP-codec could not record the HDR `VideoFrame` formats without a real HDR file; the owner
has now supplied one.

**Question.** Is HDR → SDR identical in preview and export on each engine, and affordable on the phone?

**Hypothesis.** The decoded frames of an iPhone HLG clip arrive as 10-bit 4:2:0 (`I420P10` or a
biplanar 10-bit format) with colour space bt2020 / hlg / bt2020-ncl / limited range. `copyTo` of the
planes into `R16UI` textures and our own shader (BT.2020 YCbCr → RGB, HLG inverse OETF + OOTF to linear
light with reference white 203 cd/m², BT.2390-style shoulder, BT.2020 → BT.709 with soft clip, sRGB
encode) gives the same picture in preview and export (the same `paint` runs in both; ΔE00 is set only by
the H.264 round trip: mean < 1, max < 3). `copyTo` of a 4K frame costs ≤ 8 ms on the iPhone, so 4K HLG
preview holds ≥ 24 fps. Where an engine hands out frames whose planes cannot be read (no `format`), the
engine's own upload conversion is used for both preview and export on that engine.

**Fixtures.** `HDR_IMG_6966.MOV` (iPhone 14 Pro, 4K portrait HEVC Main 10, HLG, 13 s) and
`NON_HDR_IMG_6967.MOV` (same scene, 4K HEVC SDR BT.709) from `~/clip-maker-fixtures/` (never in git).
No PQ fixture exists; the shader has a PQ branch checked only on synthetic values (recorded as untested
on real PQ files).

**Measures.**
1. Per engine: the decoded `VideoFrame`'s `format`, `codedWidth/Height`, `colorSpace`, `allocationSize`,
   and whether `copyTo` works (and with `format: 'RGBA'` conversion where offered).
2. `copyTo` time per 4K frame (median, p95) and plane upload time.
3. Preview vs export ΔE00 for the own-shader path and the engine path: 6 frames of the HLG clip painted
   at 1080 × 1920 (preview read-back) vs the same frames after H.264 export and decode; 48 cells per
   frame (8 × 6 grid, centre half of each cell averaged). Also own shader vs engine path (information).
4. 4K HLG preview fps (playback at 30 fps, display-size canvas) with the own shader and with the engine
   path; frame time split: decode wait, `copyTo`, upload, paint.
5. Visual check: side-by-side stills (own shader, engine path, SDR clip of the same scene).

**Pass criteria.** NFR-08 between preview and export on every engine tested (mean ΔE00 < 2, max < 4);
4K HLG preview ≥ 24 fps on the iPhone with the own shader, else the engine path is chosen there and
must itself meet NFR-08 between preview and export.

**Time box.** 1 day of agent work.

**Devices / browsers.** Automated: Playwright `chrome` channel and `webkit` (MacBook, Apple M3).
Playwright `chromium` has no HEVC (SP-codec) and is skipped. Owner: iPhone 14 Pro, iOS Safari.
Android deferred (D-037). Desktop Safari and Chrome by hand are optional owner runs.

**Not built.** PQ fixtures, Dolby Vision metadata (the iPhone's DV RPU is ignored; the HLG base layer is
used), HDR output, the grade chain on HDR material beyond the default grade, display-P3 output.

---

## Results (2026-11-04, automated part; branch `spike/mem-hdr`)

Status: **automated part done** (Playwright `chrome` channel 156 and `webkit` 27.2, headless, MacBook Apple M3).
The iPhone run is waiting on the owner (`spikes/mem-hdr/README.md`). Time used: about 0.4 d of the 1 d box.
Prototype: `spikes/mem-hdr/` (`hdr.html`, `hdr-worker.js`, `lib/hdr.js`). Raw data: `results/hdr-pw-*-r3.json`
(quiet host, load ≈ 5) and `-r4.json` (load 50–75, adds the SDR playback reference). Run `node summarize.mjs` to print them.
Page screenshots are git-ignored because they show the owner's footage.

### Against the pass criteria
| Criterion | Chrome 156 (macOS) | WebKit 27.2 (macOS) | Verdict |
|---|---|---|---|
| Decoded HDR frame | `format: null` (GPU-backed), colour space bt2020 / hlg / bt2020-ncl / limited, 3840 × 2160 | `format: null`, same colour space | **The own-shader path is not possible:** neither engine exposes the 10-bit planes |
| `copyTo` planes | fails ("not supported when format is null") | fails | — |
| `copyTo({format:'RGBA'})` | works, but costs 626–1611 ms per 4K frame (the engine's 8-bit conversion) | fails ("VideoFrame has no format") | not usable |
| Preview vs export ΔE00, engine path (6 frames × 48 cells, 1080 × 1920, H.264 6 Mb/s) | **mean 0.26, max 0.86** | **mean 0.43, max 1.16** | **pass** NFR-08 (< 2 / < 4) |
| Engine conversion, Chrome vs WebKit (same frame, 48 cells) | mean **0.13**, max 0.23 ΔE00 | | the two macOS engines agree (both use the OS conversion) |
| 4K HLG preview fps (1080 × 1920 canvas, engine path) | 29.1–29.2 fps (upload 0.15 ms/frame) | 23.8–26.3 fps on a quiet host; **HDR upload 24–26 ms/frame** vs 5.6 ms for the SDR 4K clip | Mac: pass in Chrome, borderline in WebKit; **iPhone: open (owner)** |
| Synthetic 4K I420P10 HLG frame through our shader (cost if planes were readable) | `copyTo` 0.7 ms, upload 2 ms, paint + sync 7.2 ms | I420P10 `VideoFrame` cannot be constructed | affordable, but there is nothing to feed it |

What the engine does: the HLG clip comes out as a tone-mapped SDR picture, not clipped or washed out. Its mean
luma code is 95 against 84 for the owner's SDR clip of the same scene (ΔE00 mean 6.2 against that clip; it was
captured a moment later, so this is for information only). Highlights roll off and the peak cell code is 239.

### What surprised us
1. **No engine hands out HDR planes.** Hardware HEVC Main 10 frames are opaque (`format: null`) in both Chrome
   and WebKit on macOS. ADR-0007 §4's preferred path cannot be built there, and iOS will very likely behave the
   same way, because it uses the same VideoToolbox path (to be confirmed by the owner run).
2. **The engines' own conversion is consistent.** Within an engine it is the same `texImage2D(VideoFrame)` call
   in preview and export, so D-014 holds by construction (ΔE00 ≤ 1.16 max). Across the two macOS engines the
   difference is 0.13 ΔE00 mean.
3. **WebKit's HDR upload is about 4.5× the cost of an SDR upload** (24–26 ms against 5.6 ms per 4K frame). That
   puts 4K HLG preview near the 24 fps line on the M3. This is the number to watch on the iPhone.
4. **Two decoder bugs on real iPhone HEVC**, found here and fixed in `lib/decoder.js`. Both affect every spike
   so far, because they all used generated H.264 without B-frames:
   - **(a) Wrong frame in the export.** The decoder picked frames 1–3 early (ΔE00 max 8.9). The cause: HEVC
     reorders frames, and packet durations are not display durations. Fix: take the wanted frame's presentation
     time from the container index (`EncodedPacketSink.getPacket(t + 2 µs)`).
   - **(b) Open GOP.** iPhone HEVC has open GOPs (CRA keyframes followed by leading pictures that reference the
     previous GOP). WebKit's decoder fails with `EncodingError: Decoder failure` and closes as soon as a seek
     restarts at such a keyframe. Fix: drop the leading pictures (pts < keyframe pts) after a random-access
     restart. WebKit also needs a decode look-ahead of 12 frames (was 4), or it holds frames back and forces
     flushes.

### Provisional verdict: **adapt**
- Use the **engine path** (`texImage2D` of the HDR `VideoFrame`, the same call in preview and export) on every
  engine tested. Drop the own-shader path from the plan. It stays in the spike code as a reference if an engine
  ever exposes 10-bit planes (Firefox and Android are untested, D-037).
- If the iPhone shows 4K HLG below 24 fps, the fallback is RULE-22's slow-device playback (show decoded frames
  as they come). This is not an HDR change.

**Implications** (queued in `spike-amendments.md`):
- ADR-0007 §4 is rewritten.
- The MOD-Engine decoder rules are added.
- The capability probe records whether HDR frames are opaque.
- NFR-08 for HDR is tested per engine, as here.

## Owner device results: iPhone 14 Pro, iOS Safari 27.0.1 (2026-11-04)
Raw data: `results/hdr-ios-1793780006878.json` (clips downloaded into memory first, not read over the network).

- **The iOS decoder tone-maps HDR to 8-bit SDR itself.** The decoded frame of the HLG clip is `NV12`, 3840 × 2160,
  tagged **bt709 / sRGB (iec61966-2-1) / full range**. The planes are readable (`copyTo` 3 ms;
  `copyTo({format:'RGBA'})` 1 ms), but there is no 10-bit or HLG data left to convert. Its upload costs 1.1 ms,
  the same as the SDR clip.
- **Engine path, preview vs export: ΔE00 mean 0.42, max 1.40** over 6 frames × 48 cells. Every frame is the right
  source frame. **Passes NFR-08.**
- **The "own" result (mean 1.20, max 3.74) is a spike-code bug, now fixed.** The page applied the HLG maths to frames
  that were already SDR, because it trusted the track's tag over the frame's. `lib/frames.js` now trusts the frame's
  colour space when it has one and counts these frames as `decoderToneMapped`. On iOS that makes the own path
  identical to the engine path.
- **4K HLG preview: 23.1–23.6 fps.** The owner's **SDR** 4K clip plays at **22.8 fps**, so HDR adds nothing on iOS.
  The shortfall is 4K HEVC playback in general:
  - median decode wait is 0 ms, but p95 is 112–125 ms (periodic decoder stalls; about 70 of 300 frames skipped);
  - paint is 10 ms;
  - SP-gpu-color's 29.9 fps at 4K used generated H.264, not real 50 Mb/s HEVC.
- A synthetic `I420P10` frame cannot be constructed on iOS (same as macOS WebKit).

### Verdict (updated): **adapt — engine path everywhere**
D-014 holds on iOS by construction: the decoder converts once, and preview and export use the same frames.
The own 10-bit shader is not needed on any engine tested: macOS frames are opaque, iOS frames are already SDR.
4K HEVC preview at 23 fps is a decode-pacing issue for MOD-Engine, not an HDR issue: it is followed up in
SP-mem-phone with the `dec.html` measurement.

**Still open:** Android and Firefox (D-037).
