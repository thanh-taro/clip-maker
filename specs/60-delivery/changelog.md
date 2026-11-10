# Changelog

Entries are needed only for items that are `building` or `shipped`.

## 2026-11-10 — F-021 building
- F-021 set to `building` (phase 4, wave 2); it stays `building` until F-001, F-008, F-010, F-011 and F-015 let AC1/AC2 run through the editor (build question 63).
- MOD-Host gains "Offline cache": one cache per version, hash-checked precache, prune on activate only with a complete copy; refines ADR-0015's "prune old assets on navigation" (build question 65).

## 2026-11-10 — Wave 1 review decisions (owner, 2026-11-05)
- F-019.R6 / MOD-Host: on the first focus, an empty project focuses Add media; with content no control is focused (build question 47).
- RULE-03: a frame-rate change the last clip can't absorb, or that would take a clip with an unknown source end below the minimum, is refused with COPY-notice.length_full (build question 51).
- RULE-15: format names in COPY-export.format_note are technical and the same in every language (build question 60).
- Tokens: `size.dialog`, `size.messageColumn`, `font.letterSpacing.caps` (build question 54).

## 2026-11-05 — F-023 building
- F-023 set to `building` (phase 4, wave 1). It stays `building` until F-015/F-016 show the export format note (R3/AC3) and F-002 wires the slow-source notice (AC7).
- platform-mapping "Start-up check": the codec probe runs on the main thread with a 1 s bound per call; the engine's effects check answers "drawn" (decides the screen and media) before the timed result (slow notice only); engine timeouts count as slow (build questions 59, 62).

## 2026-11-05 — F-019 building
- F-019 set to `building` (phase 4, wave 1).
- MOD-Host: `canShareFile(file)` added to the public surface (build question 48); the portal now grants `share` to Clip Maker (taro-kit 4c4ae94); a browser focus limit noted in the portal contract (build question 46).

## 2026-11-03 — M-1 specs ready
- F-001 … F-023 set to `ready` by Claude, on the owner's explicit instruction at gate G1.
- The owner also confirmed defaults D-024 … D-027 and the repository URL `https://github.com/thanh-taro/clip-maker`.
- Screens, components and the flow stay `draft` until phase 2 (design) completes them.

## 2026-11-03 — Spec changes from architecture review (S-1 … S-7)
- INV-01, F-015.R7 and AC7: scratch space is deleted after a successful export only once the browser has taken the file (S-1).
- F-015.AC13: only where the browser reports cancelled saves (S-3).
- F-019.R7: "storage or memory" (S-2).
- RULE-17: full screen is an optional frame grant (S-6).
- F-023: edge case for phone browsers without the codec interface (S-7).
- COPY-privacy.details: mentions the ~12 MB first-visit download (S-5).
- S-4: no change. True peak is measured on the decoded export; the internal ceiling is set in SP-audio.

## 2026-11-04 — RULE-17
- Web share is now an optional frame grant (SP-ios). Portal change request: `.build-my-app/reports/portal-change-request.md`.

## 2026-11-04 — G3 spec changes from the phase 3 spikes (SC-1 … SC-11)
Owner decisions D-044 … D-046: all changes approved; SC-9 (Share) applied; SC-10 option (b). Source: `.build-my-app/reports/g3-spec-changes.md`.
- RULE-08: quality bars split into the full-precision result and the 8-bit preview and export (ΔL* 0.5 reversal, ΔE00 1 to full precision); Grain at 0, Vignette judged per position (SC-1).
- F-007.AC2: follows the new RULE-08 bars (SC-2).
- INV-01: scratch a closing page could not delete is removed the next time the tool opens (SC-3).
- F-015.R7: same wording as INV-01 (SC-4).
- F-015.AC7: a success is checked at least 10 s after hand-over, with the export panel closed (SC-5).
- RULE-22: a source decoded slower than real time is accepted with COPY-notice.slow_device once per session; exports unaffected. Speed threshold confirmed as set in `40-technical` (SC-6).
- F-023: new AC7 and edge case for sources too heavy to decode in real time (SC-7).
- F-001: edge case for videos above 3840 × 2160 up to 5120 × 2880; frontmatter gains RULE-22 and NFR-03 (SC-8).
- F-015.R9 and F-015.AC15: Share a finished export where the device and frame allow (RULE-17); F-016.R3 includes sharing; new COPY-action.share; CMP-ExportProgress done state offers it; F-015 frontmatter gains RULE-17 (SC-9, D-045).
- F-002: edge cases for system sound interruptions and the silent switch, option (b): the preview plays its sound like a video app (SC-10, D-046).
- F-015: edge case for a size target still over after the corrective pass → fails per R6 (SC-11).

## 2026-11-05 — Wave 0 review decisions
Owner decisions on `.build-my-app/reports/build-spec-questions.md` items 1–7, 22–24, 34 and 42; technical items 18–21 and 26 applied by Claude.
- F-003.AC8: the project is 9 min 59.5 s (item 1).
- RULE-03: an add or duplicate is refused when less than the minimum length fits (item 2).
- RULE-04: after a frame-rate change, an audio clip that now overlaps moves to the next free frame start (item 3).
- RULE-11: a new layer's text fade is off (item 4).
- RULE-10, F-009.R7 and AC9: a cross-fade between clips too short to hold 0.1 s is unavailable, with new COPY-notice.crossfade_too_short; F-009 UX notes (item 5).
- RULE-06, F-005.R5 and AC4: a speed increase stopped by the minimum length shows new COPY-notice.speed_limited (COPY-notice.length_limited speaks of the 10-minute limit); F-005 frontmatter gains RULE-05 (item 6).
- RULE-02: video and audio sources shorter than 0.125 s are refused with COPY-reason.too_short (item 7).
- RULE-07: a flip mirrors the picture as displayed, after the rotation (item 22).
- F-002: edge case — at or past the project end the preview keeps the last frame (INV-07) (item 23).
- F-002.AC3: the playhead stays on the paused frame (item 24).
- INV-01 and F-015.AC14: storage kept separately for the embedded and standalone tool is swept separately (item 42).
- ADR-0010 outcome item 9: square frames are an exception to "long side a multiple of 16" (1080 × 1080) (item 34).
- RULE-22, F-023.R5 and AC8: the encode check needs a video encoder only; without a sound encoder only the exports that need one are left out; F-023 frontmatter gains RULE-16 (item 18).
- MOD-Engine public surface lists every worker message and event (item 19); MOD-Compositor no longer mentions an own HDR shader (item 20); MOD-Preview's `mountPreview` takes the engine and clock, and lists what is deferred to F-002/F-008/F-010 (items 21, 26); MOD-Codec lists `deviceCheck` and `soundExportAvailable` (item 18).
