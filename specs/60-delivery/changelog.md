# Changelog

Entries are needed only for items that are `building` or `shipped`.

## 2026-11-16 — F-007 building
- F-007 set to `building` (phase 4, wave 4); it stays `building` until the owner answers build questions 138–141 (the phone Adjust sheet, Apply to all with one clip, the slider’s pointer resolution, AC8’s export wording) and AC6's NFR-03 half is measured on the reference phone.
- SCR-Editor "Unavailable controls": the phone tab bar's Adjust tab is unavailable unless a video or photo clip is selected (as the SCR-Editor default narrow board draws it).
- CMP-Inspector "photo clip" is now built as written: a photo has the tabs Edit and Adjust (Looks with F-008), replacing the interim plain title row (build question 134).

## 2026-11-16 — F-006 building
- F-006 set to `building` (phase 4, wave 4); it stays `building` until the owner answers build questions 132–135 (the offset range, when the handles show, the photo's Edit title row, the phone turn row).
- CMP-Inspector "compact": the resize grip is built (build question 105, decided): Left/Up widen it by 16 px, Right/Down narrow it, Shift goes to the limit, Home/End go to the limits; the width is UI state and stays while the page is open. style.md "Layouts" compact says so, and that the hidden toolbar labels stay as the buttons' names (NFR-06).
- RULE-20 *Scope*: the compact inspector's resize grip gets the slider keys (it is a focusable separator), so its arrows don't step the preview.
- MOD-Preview "Public surface": the on-preview placement geometry (`screenRect`, `handlePoints`, `moveFrom`, `scaleFrom`, `pinchScale`).

## 2026-11-16 — F-005 building
- F-005 set to `building` (phase 4, wave 4); it stays `building` until the owner answers build questions 127–129 (the clip tabs and their keys, the phone Exact row, the speed slider’s movement rule).
- MOD-Project "Public surface": a plain `edit(op)` that changes the project cuts every open gesture, as undo does (build question 96; F-005 review).
- RULE-20 *Scope*: the inspector's clip tabs (a tab list) get Left, Right, Home and End (ARIA tabs pattern), so those keys don't step the preview while a tab has focus (build question 127).

## 2026-11-16 — F-004 building
- F-004 set to `building` (phase 4, wave 4); it stays `building` until F-010's text lane gives text layers their trim handles and selection (build question 125) and the owner answers build questions 122–124.
- CMP-Timeline "trimming": the readout's end time is COPY-timeline.ends_at (the copy exists; the "pending" note is removed).
- MOD-Timeline "Public surface": `itemSpan(project, id)`, which MOD-App uses to decide when Start here and End here apply.

## 2026-11-10 — F-003 building
- F-003 set to `building` (phase 4, wave 3); it stays `building` until the owner answers build questions 88–89 and the other Edit-sheet tiles and timeline tools join (F-004, F-009, F-013).
- MOD-Timeline "Public surface": `mountTimeline(element, signals, deps)` — the words, pictures and edit actions come from MOD-App, since MOD-Timeline may import only MOD-Core, MOD-Project and MOD-Media.
- MOD-Timeline "Responsibility": an imperative DOM view with canvas thumbnail strips instead of one canvas, so items are focusable named controls (ADR-0002 §1 amendment proposed in build question 94).
- copy.md: COPY-timeline.main_track ("Main track" / "Rãnh chính") names the main track's group of clips; CMP-Timeline "Accessibility" says so.

## 2026-11-10 — F-002 building
- F-002 set to `building` (phase 4, wave 3); it stays `building` until source sound decoding (ADR-0008 §6) exists for AC2 and F-003/F-008/F-009/F-010/F-013/F-015 let AC1, AC6 and AC8 run (build questions 76, 82).
- F-002.AC5: the time reads `0:02 ·01` (D-039 format) instead of `00:02:01` (build question 78, decided).
- CMP-Preview Behavior: the narrow transport keeps Previous frame, Play/Pause, Next frame, the time and Full screen; the narrow boards are outdated on this point (build question 77, decided).

## 2026-11-10 — F-022 building
- F-022 set to `building` (phase 4, wave 2); it stays `building` until F-001, F-002, F-010, F-014 and F-015 let AC2, AC4's export comparison, AC6's later panels and AC8 run (build question 68).
- copy.md: COPY-notice.added and COPY-notice.applied_all gain en-US plural forms (`one: … · other: …`; vi-VN unchanged), and F-022.AC7's count example now uses COPY-notice.added (`Added 1 file` / `Added 3 files`) instead of a bare clip count (build question 67, decided).

## 2026-11-10 — F-021 building
- F-021 set to `building` (phase 4, wave 2); it stays `building` until F-001, F-008, F-010, F-011 and F-015 let AC1/AC2 run through the editor (build question 63).
- MOD-Host gains "Offline cache": one cache per version, hash-checked precache, prune on activate only with a complete copy; refines ADR-0015's "prune old assets on navigation" (build question 65).

## 2026-11-10 — Wave 2 review decisions (owner)
- F-021.R2: the tool makes no request of its own while open; the browser may re-check for an update by itself (build question 66).
- CMP-Toolbar / CMP-MediaPanel: Add media opens the panel and the picker; finished files of a batch appear together when it ends; first-frame thumbnails, photos show 3 s (build questions 71–73). MOD-Media names the panel thumbnail.
- CMP-Notice narrow: notices sit just above an open sheet. COPY-notice.no_sound gets one/other forms (build question 74e).

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

## 2026-11-10 — E6 source sound decoding
- MOD-Audio public surface: the audio worker's `feed(port)` message, `SoundBank` and `soundDemand` (windowed decoding, ADR-0008 §2/§6; build questions 33, 76, 83–87).

## 2026-11-10 — F-014 undo and redo
- MOD-Project public surface: `beginGesture()` returns a `Gesture` handle (`edit`, `end`) instead of a global `beginGesture(key)` / `endGesture()`, so an edit made elsewhere during a drag (a batch finishing) never merges into it (build question 96).
- ADR-0011 §3 amended to the gesture handle API (past/redo lists, `changed`, `beginGesture()` handle with `onCut`/`active`), replacing `coalesceKey`, `selectionBefore/After` and the cursor (build question 96).
- MOD-Project: a gesture that ends where it began keeps the redo steps; `beginGesture(onCut?)` and `active` tell owners about a cut; after undo or redo a step that changed several items selects nothing (build question 103).

## 2026-11-10 — F-012 set the frame
- RULE-20 *Scope*: a focused option group (radio group, e.g. CMP-Inspector's aspect, rate and background) gets the arrow keys, which move its choice, so they never also step the preview (ARIA radio pattern; build question 107).

## 2026-11-16 — F-011 add music and set sound
- MOD-Assets public surface: `musicTracks()` is the compiled-in catalogue; `musicBlob(id)` / `musicBytes(id)` give a track's packaged file (when it is read: build question 113, open).
- copy.md: COPY-notice.music_unavailable (en-US, vi-VN), shown when a bundled track's file could not be read (build question 120).
- MOD-Audio public surface: the audition is `audition(trackId, length)` plus `auditionStop(t)`; the project's plan is kept meanwhile (ADR-0008 §7).
- dependencies.md: DEP-41 … DEP-43, three generated placeholder music tracks (not for release; `check:licenses --release` fails on them), and DEP-14's status (build question 114).

## 2026-11-16 — Wave 3 review decisions (owner)
- architecture.md: the export-audio worker budget is 12 KB, decided (build question 83).
- ADR-0008 §2 amended: WAV through `AudioDecoder`'s `pcm-*` codecs instead of "parsed directly", and the stereo down-mix rules written out (build questions 84, 86a).
- ADR-0002 §1 amended: the timeline is an imperative DOM view owned by MOD-Timeline, with canvas strips for thumbnails and waveforms (build question 94).
- ADR-0011 §3 amended: history keeps the last 200 steps; a later version may keep more (build question 101).
- ADR-0013 §5 and MOD-Assets Responsibility: bundled music is read on first use from the manifest-listed hashed files and precached by the service worker; the compiled-in paths stand in on the development server only (build question 113).
- F-014 edge case: if the restored project ends before the playhead, playback stops at the end (build question 99).
- RULE-13 *After undo or redo*: the changed item is selected only if it is the only changed item that still exists (build question 103).
- RULE-20: for a clip, Shift makes no difference with Alt+Left/Right; Ctrl+Y redoes on all platforms (build questions 93, 98).
- F-011 edge case and CMP-MusicPicker "row / preview failed": a bundled track that can't be read stops its preview and shows COPY-notice.music_unavailable, also during project playback (build question 120).
- SCR-Editor, style.md and CMP-Inspector "compact": at 700–999 px the inspector is hidden while the media drawer is open (build question 111); the compact inspector has a resize grip and no Close, to build with F-006/F-007 (build question 105).
- CMP-Timeline "narrow / sheet open": vi-VN tile labels wrap to two lines; the short-forms sentence is removed (build question 88).
- CMP-Notice "placement · narrow": the stack sits just above a sheet that overlays the timeline, and stays above the transport with a docked tab sheet (build question 89).
- CMP-Inspector, CMP-MusicPicker and style.md: the phone Audio sheet holds the selection's sound section (build question 112).
- style.md "Number fields" and platform-mapping: number fields accept the language's decimal separator and reject what can't be parsed by showing the value again with no edit; to build before F-005/F-007 (build question 121).
- Deferred: the bundled music tracks keep their placeholders (DEP-41 … DEP-43) through waves 4–5; before release Claude shortlists ~15 CC0 candidates, asking before any download, and the owner picks 8+ (build question 114).
