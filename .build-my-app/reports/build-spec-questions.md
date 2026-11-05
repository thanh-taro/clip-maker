# Spec questions from the build, for the owner at the wave review
From E1 (MOD-Core/Project/Plan). The behaviour currently built is in [brackets].
1. **F-003.AC8:** 9 min 59 s plus 1 s is exactly 600 s, which RULE-03 allows. Proposal: change the AC to 9 min 59.5 s, as F-009.AC6 already uses. [The AC is not cited by a test; the 59.5 s case is tested under RULE-03.]
2. **RULE-03 vs RULE-05:** RULE-03 accepts an add or duplicate when one frame fits, but RULE-05 sets a 0.1 s minimum length. [Refused when less than the minimum fits.] Proposal: make RULE-03 say "when less than the minimum length fits".
3. **Frame-rate change with adjacent audio clips:** after rounding to the new frame grid they can overlap. [The later clip moves to the next free frame start.] Proposal: add this to RULE-04.
4. **Text fade default** is not stated. [Off.] Proposal: state it in RULE-11.
5. **Cross-fade between clips too short to hold 0.1 s:** no behaviour is specified. [Nothing happens.] Proposal: the cross-fade control is unavailable, with a reason.
6. **Speed change stopped by the minimum length:** no notice is specified. [None shown.] Proposal: show COPY-notice.length_limited, or a new "too short for that speed" notice.
7. **RULE-02 "too short":** it refuses sources shorter than one frame, but sources between 1 frame and 0.1 s become 2-frame clips, which breaks RULE-05's 0.1 s minimum. (From the E1 review.) Proposal: refuse sources shorter than the 0.1 s minimum, rounded up to whole frames, with COPY-reason.too_short. [Built: sources under 0.125 s are refused (0.1 s rounded up at 24 fps, so a later frame-rate change cannot break the minimum). Pending your OK.]

## Technical items from E4 (MOD-Audio). Claude decides these; they are listed for transparency and accepted as built.
8. **MOD-Audio surface `render(audioPlan, fromSample, count)`:** a block plan holds only the voices sounding in that block, but the limiter's 1 s pre-roll needs the voices before it. [Built as `render(voices, sources, endSample, from, count)` plus a streaming `Mixer` and `renderOffline`.] Proposal: update MOD-Audio's public surface.
9. **Verify-and-trim (ADR-0008 outcome rule 2):** "first step = the excess + 0.2 dB" does not say excess over what; "at most 3 passes" does not say if the first encode counts; "a fixed −3 dB trim" does not say relative to what. [Excess over the −1.5 dBTP aim; the first encode counts, so at most 2 trims; the fallback is the last gain − 3 dB, encoded once more and not measured.] Proposal: write these into the ADR outcome or MOD-Audio.
10. **Clock:** ADR-0008 §5 says "`getOutputTimestamp()` minus `outputLatency`", but the output timestamp already describes what reaches the speakers. [The output timestamp is used, carried forward to now; `currentTime − outputLatency − baseLatency` only when there is no timestamp.] Proposal: write it this way in platform-mapping.
11. **Limiter margin:** the −1.5 dBTP ceiling holds on the limiter's own side-chain. Independent meters read up to −1.46 dBTP (BS.1770-4) and −1.39 dBTP (a 64-tap meter) on synthetic +6 dBTP overs. This matches the ADR's "PCM ≤ −1.35 dBTP" and stays inside RULE-12's −1 dBTP. [Tests check ≤ −1.35 on the meters.] No change proposed.
12. **"Underruns counted in debug builds":** there is no debug build flag. [Always counted; it is cheap. The stats come back only on request.] Proposal: drop "in debug builds".

## Technical items from E2 (MOD-Container/Codec/Media), decided by Claude
13. **Size budgets:** Vite bundles each worker separately, so the reader (about 73 KB) lands in the analysis worker and, later, the engine worker. The per-worker budgets are rebalanced (analysis ≤ 105 KB) and the code total stays ≤ 560 KB, inside NFR-10's 600 KB. Measured today: 109 KB in total. architecture.md's Size row will be updated in E3.
14. **The 3840 × 2160 scale-down box rotates with portrait video.** Accepted.
15. **"Shorter than one frame":** superseded by question 7 (the 0.125 s minimum).
16. **Damaged files → COPY-reason.no_media** ("no usable picture or sound", RULE-01). Accepted.
17. **A source's stored width and height are the size it is used at** (after scale-down). Accepted. The original size is kept for display.
18. **RULE-22 device check:** E2 requires a video AND an audio encoder, but the rule only needs a video output. Decision: require a video encoder only. With no audio encoder, sound export is unavailable rather than the device being unsupported. Fix in F-023.
