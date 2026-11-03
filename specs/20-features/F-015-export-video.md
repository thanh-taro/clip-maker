---
id: F-015
title: Export video
status: ready
milestone: M-1
priority: P0
personas: [PER-01, PER-02, PER-03, PER-04]
entities: [ENT-ExportSettings, ENT-Project]
rules: [RULE-15, RULE-03, RULE-22, RULE-19]
screens: [SCR-Editor]
components: [CMP-ExportPanel, CMP-ExportProgress, CMP-Notice]
nfr: [NFR-04, NFR-05, NFR-08, NFR-11, NFR-01]
events: []
depends_on: [F-002]
---

## Intent
The export is the product. It must be watermark-free, match the preview, hit a size the user can send, and never leave the device (PRN-01, PRN-02).

## Scope
- In: video export with resolution, quality or size target (RULE-15); progress, cancel, saving the file; using scratch space during export.
- Out: animated image and audio exports (F-016); sharing to apps or links (non-goal).

## Requirements
- **R1** The user can export the project as a video, choosing resolution and either a quality level or an "under X MB" size target (RULE-15).
- **R2** The panel shows the output format and an estimated file size before export. It explains when a size target can't be met and offers what can.
- **R3** During export the tool shows progress and time remaining, and the user can cancel at any time (NFR-11).
- **R4** The exported file matches the preview (INV-02, NFR-08), has no watermark, and contains no metadata beyond what the format needs.
- **R5** On success (RULE-15) the file is handed to the browser to save under the name of RULE-15, and the project counts as exported (RULE-19). If the browser reports the save as cancelled or failed, it doesn't count.
- **R6** If export fails (memory, encoder, storage), the project is unchanged, and the tool explains and suggests a lower resolution (PRN-07).
- **R7** Any scratch space used during export is deleted when the export ends, succeeds, fails or is cancelled. Scratch left by a page that closed during an export is deleted the next time the tool opens (INV-01).
- **R8** Exports meet the speed of NFR-04 and the memory bound of NFR-05.

## Acceptance criteria
- **AC1** Given a project, when the user opens export, then only resolutions and formats the device can encode are offered, and 1080 (or the largest offered size below it) with Balanced is chosen. (R1)
- **AC2** Given the NFR-04 fixture at 1080 and a 4 MB target that 480 can meet but 1080 can't, when the panel shows it, then COPY-export.target_lower_res names the largest resolution that meets it. Given a 1 MB target no resolution can meet, then export is unavailable and COPY-export.target_unreachable offers COPY-action.use_target with the smallest reachable whole-MB size. (R2)
- **AC3** Given a running export, when the user cancels, then it stops within 1 s, no file is saved, and the project is unchanged. (R3)
- **AC4** Given the fixture project, when exported, then each frame matches the preview within NFR-08, no watermark appears, and the file has no location, device or source names. (R4)
- **AC5** Given an export finished on 3 Nov 2026 at 14:05:09 local time, when it is saved, then the file is named `clip-20261103-140509.mp4`. (R5)
- **AC6** Given an export that fails because memory runs out, when it fails, then COPY-error.export_failed explains it and suggests a lower resolution, and every edit is still there. (R6)
- **AC7** Given any export that ends, when on-device storage is inspected, then no scratch data from it remains. (R7)
- **AC8** Given the NFR-04 fixture, when exported on the reference laptop and phone, then it finishes within the NFR-04 times, and the network log shows no request. (R8)
- **AC9** Given a device that can't encode the preferred format, when export opens, then the panel names the fallback format. (R1, R2)
- **AC10** Given the NFR-04 fixture and a 10 MB target, when exported, then the file is at most 10,000,000 bytes. (R1)
- **AC11** Given each fixture project at each quality level, when the panel shows COPY-export.estimate, then the final file size is within ±25 % of it. (R2)
- **AC12** Given a running export, when progress is observed, then the percentage updates at least once a second and never goes down, and from 10 % on the time remaining is within ±30 % of the actual time. (R3)
- **AC13** Given an export whose save the browser reports as cancelled, when the user then closes the tab, then the leave-page warning still applies. (R5)
- **AC14** Given a page closed during an export, when the tool next opens, then no scratch data from that export remains. (R7)

## UX notes
CMP-ExportPanel with COPY-export.title, COPY-export.resolution, COPY-export.quality (COPY-export.q_smaller, COPY-export.q_balanced, COPY-export.q_best), COPY-export.size_target, COPY-export.estimate, COPY-export.format_note and COPY-action.export. CMP-ExportProgress with COPY-export.progress and COPY-action.cancel. Success uses COPY-export.done.

## Edge cases
- The page is hidden or the phone locks during export → the export pauses or continues, as the device allows. If it can't continue, it fails cleanly per R6 with COPY-error.export_interrupted.
- Editing during export → the editor is locked while the export runs.
- Not enough free storage for scratch space → refused before starting, with COPY-error.no_space.

## Open questions
