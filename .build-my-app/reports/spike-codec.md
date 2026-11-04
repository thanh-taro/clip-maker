# Spike SP-codec (blocking)

**Question.** Which decode and encode configurations does each target browser actually support? Do `isConfigSupported` answers hold up under a real encode?

**Hypothesis.**
- H.264 and AAC encode work in Chromium and Safari 26. Firefox desktop encodes H.264 + Opus.
- VP9, VP8 and Opus decode work everywhere targeted.
- HEVC decodes on Safari and on Chromium on macOS.

**Success measure.**
- A matrix JSON for each browser/device: Chrome, Firefox and Safari 26 on macOS, plus iOS Safari 26.
- Each matrix covers:
  - decode: H.264 Baseline/Main/High, HEVC, VP8, VP9 and AV1, at 1080p and 2160p;
  - encode: H.264, VP9 and VP8 at 480–2160 × 24/25/30/60 fps;
  - audio: AAC and Opus encode; AAC, Opus, MP3, FLAC and Vorbis decode;
  - for every config that passes the probe, a 2 s real encode;
  - the VideoFrame formats seen with HDR sources.
- Every target has a defined video output (RULE-15 fallback order, ADR-0004).
- Probe time ≤ 300 ms.
- A record of which codecs each Playwright engine has (chromium, chrome channel, webkit).

**Time box.** 1.5 days of agent work.

**Not built.** No UI beyond a probe page that downloads the JSON.

**Devices.**
- MacBook: Chrome, Firefox, Safari. Run in Chrome via automation; the owner runs Firefox and Safari.
- Owner's iPhone, over HTTPS on the LAN using a mkcert certificate.
- Android is deferred (D-037).

---

## Results (2026-11-03, automated part; branch `spike/codec`)

Status: **partial**. The three Playwright engines are done. Firefox, Safari 26 (macOS) and iOS Safari 26 are waiting on the owner (steps in `spikes/codec/README.md`). Time used: about 0.3 d of the 1.5 d box.

Prototype: `spikes/codec/` is one static probe page with no app code. Raw data is in `spikes/codec/results/*.json`; `node spikes/codec/tools/summarize.mjs` prints a summary of every file there.
Each run makes:
- 20 decode probes;
- 75 core video encode probes: H.264 High, VP9 and VP8 × 480/720/1080/1440/2160 × 24/25/30/60 fps, plus 9:16 portrait at 30 fps;
- 40 probes of H.264 Main and Baseline;
- HEVC and AV1 encode probes at 1080p30;
- 5 audio encode probes;
- 8 audio decode fixtures (real packets made by `tools/make_audio_fixtures.py`);
- a 2 s real encode, followed by a round-trip decode, for every encode config that passed its probe.

### Matrix summary per engine (macOS, Apple silicon)

| | Playwright `chromium` 156.0.8078.4 | `chrome` channel 156.0.8078.80 (headless) | Playwright `webkit` 27.2 |
|---|---|---|---|
| API present | all four codec classes | all | all |
| Decode probe | H.264 B/M/H ✓, VP8 ✓, VP9 p0/p2 ✓, AV1 8/10-bit ✓, **HEVC ✗** (1080p and 2160p) | all ✓ incl. HEVC Main/Main10; hardware for all but VP8 | all ✓ (WebKit says "hardware" for everything) |
| Video encode probe: H.264 High / VP9 / VP8 (75 configs) | 75/75 (software only) | 75/75 (H.264 hardware; VP8/VP9 software) | 75/75 |
| Trial encode, 2 s + decode back | **75/75 pass** | **75/75 pass** | **75/75 pass** |
| HEVC / AV1 encode at 1080p30 | ✗ / ✓ | ✓ / ✓ | ✓ (0.18× real time) / ✓ |
| AAC encode (128k, 192k) | ✓ trial pass | ✓ trial pass | probe ✓; **round trip fails**: see the false positives below |
| AAC encode with ADTS output | ✓ | ✓ | probe ✗ |
| Opus encode (128k, 160k) | ✓ trial pass | ✓ | ✓ |
| Audio decode by real packets: AAC (raw + ASC, and ADTS), Opus, MP3, Vorbis | all pass | all pass | all pass |
| FLAC decode | pass | pass | **fails** with each of 3 description forms |
| Decoded frame format | I420 | NV12 (VP8: I420) | NV12 |
| Frame format from a canvas | BGRA | RGBA | BGRA |
| Slower than real time (2 s synthetic trial; includes canvas painting) | 2160p60 for all three codecs; VP8 portrait 1080p+ | VP9 1440p60 and 2160p; VP8 2160p | **VP9 at 1080p60 and every size ≥ 1440p** (0.09× to 0.64×); HEVC |

**Answers to the hypothesis (Playwright engines only):**
- H.264 and AAC encode work in Chromium-family engines.
- In WebKit, H.264 encode works and AAC encode works with one fix (see below).
- VP8, VP9 and Opus decode work in all three engines.
- HEVC decode works in Chrome and WebKit but **not** in Playwright's Chromium build.
- The hypotheses about Firefox, real Safari 26 and iOS are still open.

### False positives found by trial encode

1. **WebKit AAC encode (aac-128k, aac-192k).**
   - What happens: the encoder's `decoderConfig.description` is a whole 39-byte MPEG-4 ES_Descriptor (`03 80 80 80 22 … 05 80 80 80 02 11 90 …`), not the 2-byte AudioSpecificConfig. WebKit's own `AudioDecoder` rejects that description ("InternalAudioDecoderCocoa decoding failed").
   - What works: the same chunks decode correctly with `11 90` (the AudioSpecificConfig) or with no description (`results/aac-description-followup.txt`). The AAC bitstream is therefore fine. Only the description is non-standard.
   - **Handled by:** normalising any AAC description that starts with tag `0x03`, keeping only the DecoderSpecificInfo (tag `0x05`). Do this before muxing and before any self-check. With that fix, WebKit's output is MP4 · H.264 + AAC. Without it, a trial-gated app would wrongly fall back to MP4 · H.264 + Opus, which is what the raw trial-based selection chose.
   - The probe page now applies this fix and records it, so owner runs show it too. Verified in `results/codec-matrix-pw-webkit-fast-aacfix-*.json`: the trial-based output is `mp4-h264-aac`.
2. **WebKit FLAC decode.** `isConfigSupported` says yes, but every packet fails to decode. Three description forms were tried: `fLaC`+STREAMINFO (as the WebCodecs registry specifies), the `dfLa` box payload, and bare STREAMINFO.
   - The fixture itself is good: Chromium and Chrome decode it.
   - This needs checking in real Safari 26. If it reproduces, FLAC in Safari becomes COPY-reason.codec, or is decoded by a code path of our own.
3. **Chromium accepts a description its decoder then rejects.** For the `flac-dfla` variant (an MP4 `dfLa` payload, which is not the registry form), `isConfigSupported` returns yes but `configure` throws. This is a minor case. The lesson: always `configure` and decode the first packets after `isConfigSupported`, as ADR-0004 §2 already says.
4. **No video encode false positives** in any engine: every one of the 75 configs that passed its probe also passed its trial. The H.264 hardware encoder handled 2160×3840 portrait as well.

### Probe time (ADR-0004 §2, budget ≤ 300 ms)

Worker, module, 4 concurrent calls:

| Set | chromium | chrome | webkit |
|---|---|---|---|
| Full grid: 20 decode + 60 encode + 2 audio | 1068 ms | 1353 ms | 1827 ms |
| Minimal set: 10 decode at 1080p + 3 encode at 1080p30 + AAC/Opus encode | 40 ms cold / 42 warm | 212 ms cold / 47 warm | 95 ms cold / 30 warm |

- Each `VideoEncoder.isConfigSupported` call costs about 5 to 20 ms, because it creates a real encoder.
- **The full grid misses the 300 ms budget by 3.5 to 6×.**
- **Crash:** running an unbounded `Promise.all` over the 60-config encode grid **twice** kills the renderer in Playwright Chromium and in headless Chrome stable, both on the page and in a worker (`results/parallel-probe-crash-chromium.txt`, `tools/bisect-crash.mjs`). Sequential calls, or 20 configs in parallel, do not crash. WebKit does not crash.

### Provisional output per engine (RULE-15 / ADR-0004 order)

| Engine | Video with sound | Without sound | Audio only | Sizes |
|---|---|---|---|---|
| chromium (Playwright) | MP4 · H.264 + AAC | MP4 · H.264 | M4A AAC 192k | 480 to 2160 at every rate, both orientations |
| chrome | MP4 · H.264 + AAC | MP4 · H.264 | M4A AAC 192k | same |
| webkit | MP4 · H.264 + AAC, **with the AAC description fix** (MP4 · H.264 + Opus without it) | MP4 · H.264 | M4A AAC 192k, with the fix | same |
| Firefox, Safari 26, iOS Safari 26 | owner run pending | | | |

### Playwright engines for tests (ADR-0016)

- The bundled Playwright **`chromium` 156 on macOS has H.264 decode and encode and AAC encode and decode**. This contradicts ADR-0016's premise of "no H.264/AAC in bundled Chromium". It may still hold on Linux CI, so re-check on the CI image before relying on it.
- It lacks **HEVC decode**, so HEVC fixtures need the `chrome` project.
- WebKit has everything except working FLAC, and its AAC description needs the normalisation above.

### What surprised us

- Playwright Chromium has H.264 and AAC.
- WebKit's AAC description is an ES_Descriptor.
- Unbounded parallel `isConfigSupported` can crash Chromium.
- The cost of `isConfigSupported` is in the encoders, not the decoders: 20 decode probes take under 1 ms in total.

### Recommendation (provisional): **adapt**

ADR-0004 stands: WebCodecs only, the same fallback order, and a trial encode at the first frame. Amend it as follows:
1. **Start-up probe = minimal set only.**
   - Decode configs at 1080p.
   - One encode probe per codec at 1080p30.
   - AAC and Opus encode.
   - Concurrency capped at 4.
   This fits within 300 ms.
2. **Probe the size × rate grid lazily** when the export panel opens, and only for the codec the fallback order chose: 20 calls, about 100 to 400 ms, off the start-up path. RULE-15's "offered only when the device can encode it" is then decided there.
3. **Never fire unbounded parallel `isConfigSupported`.**
4. **Normalise AAC descriptions** (ES_Descriptor → AudioSpecificConfig) in MOD-Container/encoder glue. This is input for SP-license (the mediabunny writer).
5. Keep §6 (trial encode at export start). No video false positives were seen, but phones are untested.
6. **Plan for 2160p/60 fps exports running slower than real time** on VP9/VP8 and in WebKit. This is input for SP-speed and NFR-04, which only covers 1080p30.
7. ADR-0016: Playwright `chromium` can run H.264/AAC tests on macOS (re-verify on CI); HEVC tests use `chrome`.

### Still open (owner runs)

- Firefox: we expect no AAC encode, so output should be MP4 · H.264 + Opus.
- Safari 26 on macOS, and FLAC in real Safari.
- iOS Safari 26: probe time on the phone, whether 2160p encode works, and decoded formats from a real HLG clip via the HDR picker.
- The HDR VideoFrame formats still need a real HDR source file. The automated engines record only probes for 10-bit decode, which all pass except in Chromium where HEVC is unsupported.

## Owner device results (2026-11-04)
| Engine | Video output | Notes |
|---|---|---|
| iPhone 14 Pro, Safari 27.0.1 | MP4 H.264 + AAC at every size and rate | Probe 32 ms cold. Encode at 2160p60 runs at 0.49× real time. FLAC decode is a false positive. AAC needs its description normalised (already handled). |
| Firefox 158, macOS | MP4 H.264 + Opus, as ADR-0004 planned | Probe 3 ms. No AAC encode. Hardware H.264 encode; VP9 and VP8 are software only and slow. |
| Safari 27.0.1, macOS | **H.264 encode never produced a chunk with `latencyMode:'quality'`** (the queue stuck at 7, and at 33 with a cap of 32) | With `latencyMode:'realtime'`, H.264 1080p30 passes at 3.9× real time, and 3.2× for portrait. VP9 and VP8 also pass. |

**Verdict: adapt.**
- **ADR-0004 rule.** The trial encode runs with `latencyMode:'quality'` and falls back to `'realtime'` when no chunk arrives within about 2 s. The probe records which mode works per engine.
- **Desktop Safari** therefore exports MP4 H.264 + AAC in realtime mode. QA must check its compression efficiency and size-target accuracy against quality mode.
- **Start-up probe:** the minimal set takes 32–54 ms on every engine, inside the 300 ms budget.
