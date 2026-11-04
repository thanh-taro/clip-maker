# Changelog

Entries are needed only for items that are `building` or `shipped`.

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
