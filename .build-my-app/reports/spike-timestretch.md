# Spike SP-timestretch

Blocks F-005 (row 7 of the spike table, `architecture-proposal.md` §5). Context: RULE-06 (0.25×–4×
in 0.05× steps, quick choices 0.25/0.5/1/1.5/2/4, sound keeps its pitch), F-005.R3 and AC2
(440 Hz ± 1 % at 2× in preview and in export), ADR-0008 §4 (own WSOLA with fixed sync points every
1 s of clip output time, phase vocoder as a compared alternative, Signalsmith only as a fallback),
ADR-0001 / dependencies.md (SoundTouch LGPL and Rubber Band GPL not allowed), D-032 / ADR-0014 (no
WebAssembly, so no `'wasm-unsafe-eval'`).

**Question.** Is our own TypeScript WSOLA, with fixed sync points so any seek renders the same
samples, good enough for speech and music from 0.25× to 4×, and cheap enough to run in the audio
worker on a phone? Is our own phase vocoder a better choice?

**Hypothesis.**
- WSOLA keeps a 440 Hz tone within ± 1 % at every speed, because it only moves whole waveform
  segments. It never resamples them.
- If the sync frame is pinned to its nominal source position (no search), each sync point depends
  only on the source and the speed. Any output position can then be rendered by starting at the
  previous sync frame, so output after a seek is bit-identical to a render from 0. No cross-fade
  between independently rendered segments is needed. The cost is one unaligned splice per second.
- With a coarse-to-fine similarity search (mono sum, decimated by 4, then refined), WSOLA costs
  well under 1 % of one laptop core per stereo voice. That leaves a large margin under the 15 %
  phone budget.
- WSOLA sounds better on speech, with no phasiness. At 0.5× it repeats transients (doubled attacks);
  at 2× it drops some. The phase vocoder with identity phase locking sounds better on sustained
  tonal music at 0.5×, but it smears transients and makes speech phasey. It also costs more CPU,
  because it runs an FFT per hop per channel.

**Set-up.**
- `spikes/timestretch/`, TypeScript compiled with esbuild. The stretchers run in a module worker
  (the audio worker of SP-audio). Blocks go over a transferred `MessagePort` to an
  `AudioWorkletProcessor`, copied from SP-audio with a 400 ms buffer. The export render calls the
  same `render(from, count)` function.
- Both stretchers have the same interface: `new Stretcher(source, speed, opts)` and
  `render(outFrom, outL, outR)`. The source is 48 kHz stereo `Float32Array`s, i.e. after
  resampling, as in ADR-0008 §2.
- **WSOLA:** Hann window 40 ms (1920 samples), synthesis hop 20 ms, search ± 12 ms. The analysis
  position of frame *j* is `round(j · hop · speed)`, computed per frame and never accumulated. Sync
  frames come every 1 s of output (every 50th frame) and take no offset.
- **Phase vocoder:** FFT 4096 with hop 1024 (75 % overlap), Hann analysis and synthesis windows,
  identity phase locking (Laroche–Dolson). Phases reset to the analysis phases at each sync frame
  (every 1 s of output).
- **At 1×** both stretchers pass the samples through unchanged, as ADR-0008 does.
- **Test material** (generated, deterministic PRNG):
  - 440 Hz tone;
  - a log chirp from 100 Hz to 8 kHz;
  - a synthetic speech-like signal: glottal pulses with an f0 contour of 90–240 Hz through moving
    vowel formants, with syllable envelopes and fricative noise;
  - a music-like mix: decaying harmonic chords, bass, kick and hi-hat at 120 bpm;
  - speech plus music at −10 dB;
  - a click train for transient metrics.
- Owner clips can go in `spikes/timestretch/samples/` (git-ignored). The listening page lists them.

**Measures.**
1. **Pitch.** FFT peak, Hann window with zero padding and parabolic interpolation, on 2 s of
   output from the 440 Hz tone at every quick speed. Also at all 76 steps from 0.25× to 4×. Same
   test on the chirp: the STFT peak track against the expected frequency at the mapped source time.
2. **Identity after seeks.**
   - Render 20 s of output from 0. Re-render from 40 seek points (sync points, mid-segment, one
     sample before and after a sync point) in several block sizes (128, 1024, 1600, irregular).
     Compare bit for bit.
   - In the browser, compare the worklet's played-sample hash after a seek with the export render's
     hash for the same range.
3. **CPU.** Render time for 60 s of stereo output at each quick speed, as a % of one core
   (render ms ÷ audio ms). Measured in Node and inside a module worker in Playwright Chromium and
   WebKit. `bench.html` measures the same on phones (owner step).
4. **Artefacts, WSOLA vs PV:**
   - **Tone envelope ripple:** max/min of 5 ms RMS, in dB. This shows splices and phasiness.
   - **Steady-chord spectral flux,** relative to the input: warble.
   - **Click-train transients:**
     - rise time (10 → 90 % of the envelope);
     - pre-echo energy before each expected onset;
     - onsets detected per true onset (doubling or dropping).
   - **Speech-like:**
     - long-term spectrum distance from the input (dB) for the formants;
     - f0 track error.
5. **Blind listening** (owner step). `listen.html` plays speech, music and mixed material at
   0.5×, 1.5× and 2×, as A/B pairs with a hidden, shuffled order. Ratings run 1–5, and the page
   records the preferred version.

**Pass criteria** (from the spike table).
- 440 Hz ± 1 % at all quick speeds, in preview and export (F-005.AC2).
- Identical output from any seek (bit-exact).
- ≤ 15 % of one phone core per voice. Laptop proxy: ≤ 3 % of one M3 core, assuming a phone is
  about 5× slower.
- Listening rated acceptable (≥ 3 of 5) at 0.5×, 1.5× and 2× for speech and music. This is the
  owner's step; the provisional verdict uses the objective metrics until it is done.

**Time box.** 1.5 d.

**Not built.**
- Resampling, decoding, multi-voice mixing and the limiter (SP-audio covers these). The stretchers
  run on 48 kHz material directly.
- Speed curves (M-3).
- A transient-preserving hybrid.
- Signalsmith/WASM in the browser. It is not used here at all (D-032). A local reference is
  optional and was not needed for the decision.
- Firefox runs and phone runs: these are owner steps.

---

## Results (2026-11-04, agent runs; owner steps pending)

**Set-up.**
- Machine: MacBook Apple M3, Node 24.19, Playwright Chromium 156 and WebKit 27.2 (headless).
- The machine was shared with other spike agents and heavily loaded: the full Node suite took
  2.2 h of wall time. CPU figures are therefore the **minimum of 3 runs**. The medians are in
  `results/node.json`.
- Evidence:
  - `spikes/timestretch/results/node.json` (full suite) and `log-node-full.txt`;
  - `bench-pw-chromium-chrome-156.0-macos.json`, `bench-pw-webkit-safari-27.2-macos.json` and
    `log-playwright.txt`.
- Commands:
  - `node tools/node-check.ts`
  - `node run-playwright.mjs chromium webkit`
  - `node tools/listen-smoke.mjs` (listening page: 9 trials, renders and plays, 0 page errors)

### Against the pass criteria

| Criterion | WSOLA | Phase vocoder | Verdict |
|---|---|---|---|
| 440 Hz ± 1 % at all quick speeds; export render, all 76 steps 0.25×–4× | max error **0.001 %** (440.000–440.006 Hz) | max 0.092 % (439.65 Hz at 2×) | **pass** (both) |
| 440 Hz ± 1 % as played: worklet capture after a seek; 0.25/0.5/1.5/2/4× WSOLA, 2× PV; Chromium + WebKit | **440.000 Hz** at every speed | 439.353 Hz (0.147 %) | **pass** (F-005.AC2, preview and export) |
| Identical output from any seek, export render | bit-exact at 7 speeds (0.25, 0.5, 0.85, 1.5, 2, 3.35, 4) × 40–54 seek points (incl. every sync point ± 1 sample) × fresh and reused instances × 4 block patterns (128, 1600, 1024, irregular 77/1024/300/4096/1) | bit-exact, same matrix | **pass** (both) |
| Identical output from any seek, preview vs export | worklet-played hash = export-render hash in 7/7 seek cases per engine, 0 underruns | the same | **pass** |
| Same output across engines | **identical hashes** in Chromium and WebKit | **differs** between engines (`atan2`/`cos`/`sin` results) | WSOLA only |
| CPU per stereo voice, % of one M3 core: Node | **0.39–0.53** | 1.62–1.65 | |
| CPU per stereo voice: Chromium worker | **1.23–1.50** | 4.07–5.21 | |
| CPU per stereo voice: WebKit worker | **0.78–0.92** | 3.71–4.28 | |
| CPU: laptop proxy ≤ 3 % | | | **pass** WSOLA, **fail** PV |
| Worst seek: first block rendered just before a sync point (Node / browsers) | 3.6 ms / 7–12 ms | 10 ms / 27–34 ms | WSOLA fits a 400 ms buffer easily |
| ≤ 15 % of one phone core | projected ≤ 7.5 % (worst browser figure × 5) | projected 18–26 % | **pending owner** (`bench.html` on iPhone and Android) |
| Listening acceptable at 0.5×/1.5×/2× (speech, music) | | | **pending owner** (`listen.html`) |

### Artefact metrics (Node, 12 s material, from `node.json`)

| Metric | Input | WSOLA (0.25 / 0.5 / 1.5 / 2 / 4×) | PV (0.25 / 0.5 / 1.5 / 2 / 4×) |
|---|---|---|---|
| 440 Hz tone envelope ripple, dB (5 ms RMS max−min) | 0 | 0.57 / 0.55 / 0.55 / 0.55 / 0.55 | 1.0 / **6.8** / 4.9 / **13.8** / 5.8 |
| Steady-chord spectral flux ÷ input | 1 | 0.94 / 0.98 / 1.14 / 1.18 / 1.42 | 0.98 / 1.01 / 1.07 / 1.07 / 1.06 |
| Click onsets detected per click (1 = right) | 1 | **1.25** / 1.0 / 1.0 / **0.77** / **0.65** | **5** / 1.17 / 1.0 / 1.15 / 0.74 |
| Click rise time 10→90 %, ms | 0.08 | 0.08 / 0.08 / 0.23 / 0.25 / 0.25 | **20 / 21 / 7.5 / 6.3 / 5.6** |
| Click pre-echo, dB rel. attack | none | none at every speed | −4.9 / −11.9 / −21 / −22 / −17 |
| Click timing jitter (median), ms | 0.04 | 3.0 / 7.0 / 7.0 / 4.6 / 7.5 | 15 / 9.3 / 2.6 / 5.1 / 16 |
| Chirp tracking error, median % (max %) | 0.003 | 0.60 (6.0) / 0.58 (5.1) / 0.59 (3.2) / 0.57 (3.5) / 0.72 (2.8) | 0.06 (5.4) / 0.06 (3.0) / 0.17 (1.7) / 0.28 (1.3) / 1.21 (4.6) |
| Speech-like long-term spectrum distance, dB | 0 | 0.54 / 0.48 / 0.26 / 0.27 / 1.49 | 0.67 / 0.45 / 0.72 / 0.92 / 1.41 |
| Speech-like f0 error, median % (gross > 5 %) | 0.48 (3.9) | 0.85 (4.4) / 0.89 (3.9) / 0.68 (3.9) / 0.87 (4.2) / 1.67 (20) | 0.35 (4.2) / 0.39 (4.0) / 0.53 (3.5) / 0.76 (4.2) / 2.10 (23) |
| Music-like long-term spectrum distance, dB | 0 | 0.39 / 0.34 / 0.20 / 0.26 / 0.89 | 0.54 / 0.34 / 0.50 / 0.74 / 0.69 |

How to read the table:
- **WSOLA** keeps attacks sharp, with no pre-echo, and its envelope stays flat. Its weaknesses
  are the expected ones:
  - repeated attacks at 0.25× (1.25 onsets per click);
  - dropped short attacks at 2× (23 % lost) and 4× (35 % lost);
  - ± 3–7 ms timing jitter;
  - more warble on steady tones at 4×.
- **PV** tracks frequency more smoothly (chirp median 0.06 % at 0.5×). However:
  - it smears every attack over 6–20 ms with audible pre-echo;
  - its phase reset at each sync point punches a 5–14 dB dip into a steady tone, once per
    1.024 s.

### What surprised us
- **The sync-point design costs the PV far more than WSOLA.**
  - In WSOLA a pinned frame is just one unaligned splice, and the 0.55 dB ripple is the same at
    every speed.
  - In the PV the phase reset is a periodic dip of up to 13.8 dB. Making the PV seekable would
    need a different reset strategy, for example a cross-faded dual chain, which costs about 2×
    CPU.
- **WSOLA is bit-identical across engines; the PV is not.** WSOLA's hot path is only `+`, `*` and
  `sqrt`, which IEEE-754 rounds exactly. The PV depends on each engine's `atan2`/`cos`/`sin`.
  Cross-engine golden files (ADR-0016) therefore work for WSOLA only.
- **No cross-fade between segments is needed.** Pinning the sync frame to its nominal position,
  with offset 0, makes every frame a pure function of (source, speed, j), so seeks are bit-exact
  for free. ADR-0008 §4 mentions "a short cross-fade"; it is unnecessary.
- **Chromium runs the same TypeScript about 2.5–3× slower than Node and WebKit** (1.2–1.5 % vs
  0.4–0.9 %), even in a module worker. It is still far under budget.
- **Seek pre-roll needs source behind the seek point.** The search chain starts at the previous
  sync point, which can be up to 1 s of output earlier. At 4× that is up to 4 s of *source*
  before the seek position. The windowed decoder (ADR-0008 §6, about 2 s ahead) has to decode
  from that earlier point after a seek. The search only reads mono L+R, so this is cheap.
- **One harness bug, fixed:** the bench page listened on the worklet's `MessagePort` with
  `addEventListener` without calling `start()`. That is worth a note in the MOD-Audio
  implementation.

### Provisional recommendation: **adopt WSOLA** (ADR-0008 §4 as written, with the amendments below). **Reject our own PV.**

This is provisional until the owner's phone CPU runs and blind listening are in.

Why WSOLA:
- It passes F-005.AC2 with a 1000× margin (0.001 % against 1 %).
- It is bit-exact from any seek, between preview and export, and across engines.
- It costs about 1 % of a laptop core per voice in browsers, with a projected ≤ 7.5 % on phones.
- It is better than the PV on speech-like material and transients.

Why not the PV:
- It costs 3–4× more CPU, and projects past the 15 % phone budget.
- It is not deterministic across engines.
- It smears transients.
- Its seek-safe phase resets cause periodic level dips.

Signalsmith (DEP-40) stays an unadopted fallback and is only needed if the owner's listening
rates WSOLA below 3 on music at 0.5× or 2×.

**Implications for the specs and architecture** (queue as ADR-0008 amendments or a superseding
ADR):
1. **ADR-0008 §4 parameters:**
   - Hann window 40 ms, hop 20 ms (output), search ± 12 ms.
   - Coarse search on the L+R sum decimated ×4, then a ± 4-sample full-rate refinement.
   - Normalised correlation over the 20 ms overlap.
   - Analysis position `round(j·hop·speed)` per frame, never accumulated.
   - Sync frame every 50 frames (1 s of output), pinned at offset 0, **with no cross-fade**.
   - 1× bypasses the stretch.
2. **ADR-0008 §6 / MOD-Audio:**
   - After a seek, decode from the previous sync point's source position minus 32 ms. That is up
     to `1 s × speed` of source behind the seek, 4 s at 4×.
   - Worst seek render is ≤ 12 ms in browsers.
3. **ADR-0016:**
   - The 440 Hz ± 1 % unit test can cover all 76 steps, in about 1 s of Node time on an idle
     machine.
   - Golden hashes for WSOLA output are valid across engines.
4. **Known quality limits**, for the F-005 copy and QA notes:
   - doubled attacks at ≤ 0.5×;
   - about 23 % of very short clicks lost at 2× and about 35 % at 4×;
   - 3–7 ms timing jitter on attacks.

   A transient-aware search bias is a possible M-2 refinement if listening flags drum loss at 2×.
5. **Unresolved, owner steps** (see `spikes/timestretch/README.md`):
   - `bench.html` on the iPhone (Safari) and the Android phone (Chrome): ≤ 15 % per voice;
   - `listen.html` blind A/B with the owner + 1 listener, plus any real clips in `samples/`.

## Owner results (2026-11-04)
**iPhone 14 Pro bench** (iOS Safari 27):
- WSOLA uses 0.35–0.39 % of one core per voice; the phase vocoder (PV) uses 1.5 %. Both are far under the 15 % budget.
- Pitch: WSOLA max error 0.001 %, PV 0.092 %.
- Worst seek render: WSOLA ≤ 4 ms, PV ≤ 12 ms.

**Blind listening** (owner, 9 trials on synthetic material, Safari macOS, headphones). Ratings 1–5, where 3 means acceptable:

| | WSOLA | PV |
|---|---|---|
| Mean rating | **3.67** | 3.22 |
| Lowest rating | **3** | 1 (music at 2×) |
| Trials preferred | 5 of 9 | 4 of 9 |

- PV was preferred at 0.5× (speech, music) and at 1.5× music, which matches WSOLA's known slow-speed artefacts.
- WSOLA was never rated below acceptable. PV failed badly on music at 2×.
- A second listener and real clips were not done; they are optional and can be covered in QA.

**Verdict: adopt WSOLA** (ADR-0008). Note the slow-speed quality (0.25–0.5×) as a possible M-2 improvement, for example longer analysis windows when speed is below 1.
