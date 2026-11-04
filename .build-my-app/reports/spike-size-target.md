# Spike SP-size-target

Frame: row 12 of the spike table in `architecture-proposal.md` §5. Checks RULE-15 ("Meeting a size
target"), F-015.AC2 / AC10 / AC11 and ADR-0010 §4–6 against real encoders, using the export path
settled by SP-speed (`VideoFrame(canvas)` → `VideoEncoder` H.264, queue cap 4–8, mediabunny MP4 with
pre-encoded AAC from the audio pass, `latencyMode: 'quality'`, hardware preferred).

**Question.** (1) Does the size-target maths of ADR-0010 §5 (video kbps = (X × 8,000 × 0.95 − audio
kbit − overhead) ÷ seconds, overhead = 1 % + 512 kbit) with constant bitrate, plus at most one
corrective pass, ever produce a file above X × 1,000,000 bytes? (2) Is the panel's estimate (ADR-0010
§6: bitrate × duration refined by a calibration encode of ≤ 3 sampled seconds) within ±25 % of the
final file for every fixture and quality level (F-015.AC11)? (3) Are the per-resolution floors in
`architecture.md` "Export tables" (480: 300, 720: 600, 1080: 1,000 kbps) sensible — does the encoder
actually honour them, and do they look acceptable?

**Hypothesis.**
- Hardware H.264 in constant-bitrate mode lands within ±5 % of the requested bitrate over ≥ 30 s,
  so the 0.95 factor keeps every size-target file under X; the corrective pass is rare (≤ 1 in 20)
  and one pass is always enough.
- Variable bitrate undershoots on simple content (screen recording: file ≈ 30–60 % of the nominal
  estimate), so the naive estimate fails AC11 there; a 3 × 1 s calibration encode (key + delta frame
  sizes extrapolated to the export's keyframe interval) brings every fixture within ±25 %, and costs
  ≤ 1.5 s at 1080p in Chrome.
- The floors are roughly right for talking-head and screen content; high-motion content at the
  floor looks blocky but legible.

**Measures** (per engine, per fixture × resolution × setting).
1. Quality levels (VBR, `bitrateMode: 'variable'`): nominal estimate, calibrated estimate(s),
   final bytes; estimate error = estimate ÷ final − 1. Calibration wall time.
2. Size targets 8 / 10 / 25 / 50 MB (CBR, `bitrateMode: 'constant'` where `isConfigSupported` and a
   real encode accept it, else VBR): reachability per RULE-15 (and the offered resolution / smallest
   whole-MB target when not reachable); final bytes ÷ target; passes needed (up to 3 recorded, the
   spec allows 1 corrective pass); wall time per pass; container overhead actually measured
   (file − video − audio packet bytes); actual audio bytes.
3. Floors ladder: 15 s CBR encodes at bitrates around each floor; delivered ÷ requested bitrate;
   luma PSNR vs the uncompressed source frame (4 sampled frames); still frames (PNG) at the floor
   for the owner's visual check, plus the uncompressed reference.
4. Host load average (1-min) at start, every 5 s and at the end of each batch.

**Fixtures** (generated, deterministic, drawn per frame at the export size; sound = pre-encoded AAC
128 kbps 48 kHz stereo reused across all settings as the audio pass would produce it):
- **talk** — talking-head-like, 9:16, 60 s: soft static background, a swaying head with a moving
  mouth, low sensor noise. Low motion.
- **screen** — screen-recording-like, 16:9, 120 s: document/code text on white, scroll steps every
  few seconds, a moving cursor, a window switch every 30 s. Very compressible, sharp text.
- **motion** — high motion, 16:9, 30 s: fast pan + rotation over a detailed texture, confetti,
  strong noise. Hard.
- **nfr04** — the NFR-04 fixture (SP-speed project: three phone-like clips, cross-fades, title,
  look + 6 adjustments, Blur background, music) rendered once through the SP-speed pipeline at
  1080 × 1920, 24 Mb/s, as a mezzanine; decoded and scaled per frame for each export; its own mixed
  AAC track is reused. 9:16, 60 s.
Resolutions: 480, 720, 1080 (shorter side; 480 × 854 / 854 × 480 etc.).

**Pass criteria.** Estimate within ±25 % of the final file for every fixture × resolution ×
quality level (AC11). No size-target file above X × 1,000,000 bytes after at most one corrective
pass (AC10, RULE-15), checked for every reachable fixture × resolution × target. AC2 worked check
reproduced on the NFR-04 fixture (4 MB → 480 offered; 1 MB → smallest reachable target offered).
Floors: the encoder delivers ≤ the requested bitrate at every floor, and the stills look acceptable
to the owner (owner judgement; agent proposes values from PSNR + delivered bitrate).

**Time box.** 1.5 days of agent work.

**Devices / browsers.** Automated: Playwright `chrome` channel (dev only, DEP-34) and `webkit` on
the MacBook (Apple M3, 8 cores, 16 GB), headless, host shared with other agents (load recorded).
Playwright `chromium` (SwiftShader + software encoder): skipped. Owner: Safari 26, Firefox and Chrome
on the Mac, one iPhone over HTTPS on the LAN (mkcert as before; the agent never installs CAs; no
tunnels) — steps in `spikes/size-target/README.md`.

**Not built.** The panel UI; 1440/2160 (same maths, needs 4K sources); 24/25/60 fps scaling of the
tables; GIF and audio-only targets; the grade pipeline per export (the NFR-04 mezzanine stands in);
OPFS scratch; cancel; Opus/WebM fallback formats; `quantizer` mode (probed only).

---

## Results (2026-11-04, automated part; branch `spike/size-target`)

Status: **automated part done**: Playwright `chrome` channel 156 and `webkit` 27.2, headless, MacBook
Apple M3 (8 cores). Per engine: 4 fixtures × 480/720/1080 × (Smaller/Balanced/Best + targets 8/10/25/50 MB
+ "tight" 10/25 MB + a 4-rung floors ladder) = 36 quality exports with 72 calibration encodes, 48 size-target
rows (42 reachable, 6 offered a lower resolution) + 22 tight rows, each reachable row with a pre-check, and
48 ladder encodes. Safari 26, Firefox, Chrome by hand and the
iPhone are owner runs (`spikes/size-target/README.md`). Time used: about 0.5 d of the 1.5 d box.

**Host load**: the 1-min load average was 3–8 for most of the WebKit run. It was 10–123 during the final
Chrome run and at the end of WebKit `nfr04` (other agents). It is sampled every 5 s in each JSON. Sizes and
estimate errors don't depend on load. Times do.

Prototype: `spikes/size-target/` (copied from SP-speed). Raw data: `results/size-<engine>-<fixture>.json`.
Full tables: `results/summary.txt` (`node summarize.mjs`). Floor stills for the owner:
`results/floors/chrome-<fixture>-<res>-<floor|ref>.webp` (lossless, committed). All rungs and the WebKit
stills are in `results/stills/` (local only, not committed).

### Against the pass criteria

| Criterion | Chrome | WebKit | Verdict |
|---|---|---|---|
| AC11: estimate within ±25 % for every fixture × res × quality (36 rows per engine) | ADR-0010 §6 as written (3 × 1 s calibration): **max 35.6 %**, 31/36 within. Nominal only: max **+536 %** (screen). **3 × 2 s calibration, capped at nominal: max 6.0 %, 36/36** | 3 × 1 s: **max 60.9 %**, 27/36. **3 × 2 s capped: max 13.9 %, 36/36**. With the real AAC size: **max 3.3 %** | **pass with 3 × 2 s**; fail as written |
| AC10 / RULE-15: never above X × 1e6 after ≤ 1 corrective pass (42 reachable rows per engine) | 40/42 under after pass 1 (fill 22–94 %). **2 over: motion 1080 at 8 MB (127 %) and at 10 MB (102 %)**, still over after 3 passes | The same 2 over (148 %, 119 %), still over after 3 passes | **fail as written**. **Pass with the proposed pre-check**: it flags both, with no misses in 42 rows per engine |
| Corrective pass when the overshoot is small ("tight" targets: no 0.95 headroom, no overhead allowance) | Over after pass 1 by ≤ 0.8 %, except motion 1080. Pass 2 lands at 97.0–97.4 % | Same pattern. Pass 2 lands at 96.9–97.3 % | One pass is enough **when the encoder can reach the rate** |
| AC2 worked check (NFR-04 fixture, 60 s) | 4 MB → 365 kbps: at or above the 480 floor (300), below the 720 floor → offer 480. 1 MB → no resolution. The smallest reachable target is **4 MB** (3 MB → 240 kbps) | Same maths | **pass** |
| The encoder honours the floors (15 s CBR at the floor) | talk/nfr04: 101–102 % of the request. Screen: 54–65 % (under). **Motion: 211–264 % (over)** | talk/nfr04: 100–103 %. Screen: 54–65 %. **Motion: 270–314 %** | The encoder has a **content-dependent minimum** (see below) |
| Floors look acceptable | Stills committed. Agent's view: nfr04, talk and screen look acceptable at 300/600/1,000 | — | **Owner judgement still open** |

### Estimate (quality levels, VBR)
- Chrome and WebKit VBR hit the nominal bitrate within 0.1–0.8 % on talk, motion and nfr04. VBR acts like
  an average-bitrate cap. On **screen** content both undershoot a lot: 376–1,565 kbps against
  900–10,000 kbps nominal. A nominal estimate is therefore 2–6× too big, as the ADR expected.
- **3 × 1 s is too short.** Each 1 s range starts with a forced keyframe while the encoder's rate control
  is still warming up. On screen content the estimate comes out 18–61 % too large.
- **3 × 2 s works.** Each range is one 2 s GOP, and the three are encoded as one contiguous stream with a
  keyframe at each range start. The video estimate is key-mean × keyframes + delta-mean × the other
  frames, capped at the nominal bitrate. It lands within −6.5 % to +13.9 % everywhere.
- Cost of the 3 × 2 s calibration: median 0.36–0.65 s at 480/720 and 0.92–1.05 s at 1080. The worst case
  was 4.0 s (WebKit 1080 at a load average of about 90).
- WebKit's AAC ignores `bitrate` and depends on the content. It measured 68 kbps (talk, screen) and
  89 kbps (motion); Chrome measured 122–127 kbps. Assuming 128 kbps costs WebKit up to +13.9 % on the
  120 s screen fixture. Using the engine's measured AAC rate brings this down to 3.3 %.
- Container overhead measured 11–40 KB, about 0.35 KB per second (336–368 B/s). That is far below the
  ADR's allowance of 1 % + 512 kbit.

### Size targets (CBR)
- `bitrateMode: 'constant'` passes `isConfigSupported` at every size in both engines and is echoed back.
  When the encoder can reach the rate, it delivers 100.0–100.8 % of the request. On screen content it
  delivers much less (fill 22–77 %): "constant" acts as a cap, not a fill. `quantizer` mode is supported in
  Chrome; in WebKit, `isConfigSupported` throws.
- With the ADR's 0.95 factor + 1 % + 512 kbit, first-pass fill is 88.0–94.6 % on content the encoder can
  reach. About 5 % of the target goes unused. The tight runs show the margin actually needed is about 1 %.
- **The overshoot that matters is an encoder minimum, not rate-control error.** On the high-motion
  fixture (fast pan + strong per-frame grain), the hardware encoders won't go below these rates, whatever
  is requested:

  | Engine | 480 | 720 | 1080 |
  |---|---|---|---|
  | Chrome | ≈ 633 kbps | ≈ 1,358 kbps | ≈ 2,642 kbps |
  | WebKit | ≈ 809 kbps | ≈ 1,658 kbps | ≈ 3,136 kbps |

  The corrective pass then does nothing: Chrome at 8 MB went 127.0 → 126.5 → 126.1 %. Chrome's software
  encoder (`prefer-software`, OpenH264) is worse: 2.2 Mb/s at 720 and 4.2–4.8 Mb/s at 1080 on the same
  content.
- **Pre-check (built and measured).** When the user picks a target, run the 3 × 2 s calibration at the
  target's CBR bitrate. The predicted file is calibrated video + audio + overhead.
  - It predicted the first pass within −7.3 % to +10.9 % on all 84 normal rows (both engines).
  - It flagged exactly the 4 normal rows that went over (predicted 133–161 %), with no misses.
  - It costs 0.3–1 s, the same as the estimate calibration.
- Time per pass = one full export. At 1080, a 60 s project took 8.6–10 s in Chrome and 9.3–40 s in WebKit
  (under load); the 120 s screen fixture took 17–18.5 s. A corrective pass doubles that. None of the 80
  normal rows the pre-check let through (both engines) needed one.

### Floors
Delivered bitrate and luma PSNR at the current floors (15 s CBR). PSNR is against the uncompressed frame;
"lp" is after a 4 × 4 box filter, i.e. structure without the grain.

| Fixture | 480 @ 300 | 720 @ 600 | 1080 @ 1,000 |
|---|---|---|---|
| nfr04 (phone clips + grade) | 303 kbps, 34.6 dB (lp 41.9) | 606, 35.6 (42.2) | 1,015, 32.5 (40.3) |
| talk | 305, 38.9 (48.9) | 615, 39.2 (49.5) | 1,013, 39.3 (49.8) |
| screen | 196 (under), 49.7 (58.4) | 329, 52.6 (60.7) | 552, 55.5 (62.5) |
| motion (worst case) | 633–809 (over), 23–24 | 1,358–1,658 (over), 24–25 | 2,642–3,136 (over), 25–26 |

These are Chrome numbers; WebKit is within ±1.2 dB. PSNR moves ≤ 1.5 dB between 0.67× and 2× the floor
for nfr04, talk and motion; screen gains 3–7 dB. Grain dominates the error in these fixtures, so PSNR
can't separate the rungs. The owner's eye has to.

### Proposed floors table (provisional, pending the owner's visual check)

| Resolution | Floor (kbps, 30 fps) | Change | Plus |
|---|---|---|---|
| 480 | 300 | keep | Long side a multiple of 16: **848 × 480 / 480 × 848** |
| 720 | 600 | keep | 1280 × 720 |
| 1080 | 1,000 | keep | 1920 × 1080 |
| 1440 | 2,000 | keep (untested) | — |
| 2160 | 4,000 | keep (untested) | — |

A target is reachable at a resolution only if both hold:
- the computed video bitrate is at or above the floor, **and**
- the pre-check predicts a file ≤ X × 1,000,000 bytes.

The "smallest whole-MB target 480 can meet" uses the larger of the 480 floor and the pre-check's
delivered rate at 480.

### What surprised us
1. **Encoders have a content-dependent minimum bitrate.** It can sit 2–3× above our floors, for hardware
   and software encoders alike, and CBR silently ignores lower requests. A floor table alone can't
   guarantee AC10. Only a measurement on the actual project can.
2. **Chrome resamples frames whose width isn't a multiple of 16.** At 854 × 480 the decoded output is
   slightly stretched and luma PSNR is 22–23 dB at any bitrate. At 848 × 480 it's 46–52 dB (screen
   fixture). Compare `results/align2/` (the first Chrome run) with the final runs.
3. **3 × 1 s calibration isn't enough** (up to 61 % off); 3 × 2 s is (≤ 14 %).
4. **"Constant" bitrate under-fills easy content by up to 78 %.** A size-target file of a screen
   recording is often a third of the target. That's fine for the rule ("at most"), but users may expect
   "about X".
5. **The ADR's overhead allowance is about 25× the measured MP4 overhead.**

### Provisional verdict: **adapt**
The ADR-0010 approach works: size-target maths, CBR, one corrective pass and a calibration estimate.
It needs three changes:
1. Calibration ranges of 2 s (one GOP) instead of 1 s.
2. A size-target pre-check that decides whether a target is reachable.
3. Output sizes whose long side divides by 16.

The floors stay as they are until the owner's visual check.

### Implied changes (queued for `spike-amendments.md`)
- **ADR-0010 §6 (estimate):**
  - Calibration = 3 ranges × 2 s at 10/50/90 % of the project, encoded as one contiguous stream with a
    keyframe at each range start.
  - Video = key-mean × keyframes + delta-mean × the other frames, capped at nominal.
  - Audio at the probe-measured AAC rate per engine (WebKit ignores `bitrate`: 68–89 kbps measured).
  - Overhead ≈ 4 KB + 0.35 KB/s.
  - Cost ≤ ~1 s at 1080 on the laptop.
- **ADR-0010 §5 + RULE-15 (spec clarification, owner):**
  - "Can be met" means the floor is met **and** a pre-check (calibration at the target bitrate) predicts
    ≤ X × 1e6.
  - The smallest whole-MB target at 480 uses max(floor, measured delivered rate).
  - The corrective pass stays: bitrate × budget ÷ actual × 0.97.
  - If the file is still above X after it, **it is never saved**. The panel shows
    COPY-export.target_lower_res for the next lower resolution. F-015 needs an AC for this edge case.
- **ADR-0010 §5 constants:** keep the 0.95 factor (VBR-fallback engines and Firefox are unmeasured).
  Either replace the overhead term with the measured model (1 % + 512 kbit is ~25× too big), or keep it as
  headroom and say so.
- **architecture.md "Export tables" / platform-mapping:** round the output's long side to a multiple of 16
  (480p = 848 × 480 / 480 × 848). Floors 300/600/1,000 stay until the owner's visual check.
- **ADR-0004 (probe):**
  - Record `bitrateMode` support: constant and variable everywhere tested; quantizer Chrome-only.
  - Record the delivered AAC rate.
  - Chrome's software H.264 has a much higher minimum bitrate, so size targets on software-only devices
    rely on the pre-check.
- **ADR-0016 / QA:**
  - Add the high-motion + grain fixture to the AC10 test set. It's the only fixture that breaks the floors.
  - Add a check that export dimensions divide by 16.

### Owner steps
Full steps are in `spikes/size-target/README.md`. Use mkcert as before; the agent installs no CA and opens
no tunnels.
- **Mac:** Safari 26, Firefox and Chrome at `https://localhost:8447/`.
- **iPhone:** `https://<LAN-IP>:8447/?fixtures=nfr04,screen&parts=quality,target`.
- **Visual check:** for each fixture and resolution, compare `results/floors/chrome-<fx>-<res>-<floor>.webp`
  with `…-ref.webp`, and say whether each floor is acceptable.
