# Changelog

Entries are needed only for items that are `building` or `shipped`.

## 2026-11-25 — Released 1.2.0 to production (D-053)
- `v1.2.0` (the `v1.2.0-rc.1` build) is live at `https://clip-maker.tarokit.app` with the colour mixer, colour pop, split toning and duotone; Clip Maker is also listed in the TaroKit portal (portal 1.5.4). Report: `.build-my-app/reports/release-1.2.0.md`.

## 2026-11-25 — Release candidate 1.2.0 (D-053 colour tools)
- F-024 colour mixer, F-025 colour pop, F-026 split toning and F-027 duotone built (engine and UI, two review rounds each) and `shipped`. Version 1.2.0, candidate `v1.2.0-rc.1`; verification in `.build-my-app/reports/release-1.2.0.md`. F-028 colour replace stays `draft` for 1.3.0 (M-5).

## 2026-11-25 — Colour tools: spec review round 2 (D-053)
- RULE-24 *Split toning*: the tints fade to none within 20 (was 5) of black and white, so the grey-ramp 4× bar holds for every shadow hue (N1); ADR-0017 §4 follows. *Duotone*: a pixel's gradient position is its CIELAB L* ÷ 100, not the working-space lightness, so every built-in pair meets the 4× bar at the first step (N2); F-027.R2, F-027.AC2 and ADR-0017 §4 follow. The per-step weight bound now names its unit per fade (hue-ring step, lightness unit, or working-space chroma unit for the grey fade), and ADR-0017's grey gate edges are 0.0065–0.029 OK C, matching C* 2 and 12 (N3, N4). A duotone Reset or Reset all forgets the remembered colours; None keeps them (N5, F-027.AC8).

## 2026-11-25 — Colour tools: spec review fixes and owner answers (D-053)
- Review `.build-my-app/reports/review-d053-spec.md` addressed. RULE-24 *Quality*: smoothness is now a per-weight bound (every tool weight changes continuously and by at most 1.5 ÷ fade width per step); the 4× bar stays for the grey ramp only (B1). *Measures*: lightness kept, hue reached and range centres are judged in the working perceptual space (named in ADR-0017 only); ΔE00, C* and the grey test stay in CIELAB; "L* within 2" bars replaced (B2). Hue ring defined (CIELAB L* 60, C* 30, one step per degree of working-space hue) with centre steps; hue-wheel range centres for slider value text, ties to the later range (M1, m4).
- Split toning: negative Balance now favours the shadows tint (crossover 80 at −100, 20 at +100), matching COPY-split.balance_shadows; tone weights defined (M2). *History*: choosing which mixer range is shown is not an undo step and is not stored (M3). Duotone: choosing a pair or Custom starts Strength at 100; None keeps the last colours for Custom; schema `duotone` gains `on` and an enum `pair` (M4). RULE-25: chroma floor fades smoothly; lightness kept per *Measures* (m6).
- F-024–F-028 ACs updated to match; F-024–F-027 open questions confirmed by the owner (one feature per tool, colour pop keeps one of 8 ranges, 210°/35° defaults, six duotone pairs; Reset all resets colour tools and keeps the look). F-028 records Q5–Q7 as owner-confirmed (source sampling, To = From, Range 30 / Softness 50) and stays `draft` until its 1.3.0 review.
- Minors: NFR-03 load is "every colour tool the build has" (m2); COPY-picker.hex_invalid accepts #RGB (m3); group Reset is a separate button (m5); CMP-ColourPicker Saturation drag stops before grey for From (m7); "None" in specs with "Off" as visible copy, glossary adds Hue wheel, Hue ring, Pick mode (m8); colour-tool groups sit after Effects and the narrow picker has a fixed top part (m9); RULE-20 Mod+C/V and F-007.R7 / UX notes mention colour tools (m10); M-4 builds only after ADR-0017 is accepted following SP-colour-tools (m11). ADR-0017 §2–§5 aligned.

## 2026-11-25 — Colour tools (owner decision D-053)
- Build reviews (`review-d053-ui.md`, `review-d053-code.md`): CMP-ColourPicker gains a subtitle naming the colour it edits (COPY-picker.editing), a labelled split before/after swatch (COPY-picker.before, COPY-picker.now) beside the hex field, a hex field that keeps invalid text while marked, closing when its group, tab or sheet closes, wide presets in two rows of five, and on narrow layouts a 60 % sheet with the footer hidden and labels left of the sliders so it fits 320 × 640 without inner scrolling (style.md sheet height follows). CMP-Inspector: a colour-tool group shows changed and its Reset only while the tool is on and changes the picture (colour pop None and duotone None keep their values unshown; Reset all still forgets them; F-025, F-027 UX notes); group titles, in-group labels and the Light/Colour/Effects titles get distinct styles; hover tints only on hovering devices; range swatches one row of eight from eight touch targets of width. ADR-0017 and MOD-Compositor note that the compositor derives the stages from `colourTools`, shader variants compile on first use, and grey pixels skip the mixer and pop maths.
- Five colour tools for video and photo clips. New features: F-024 Mix colours by range (colour mixer), F-025 Keep one colour (colour pop), F-026 Tint shadows and highlights (split toning) and F-027 Recolour in two colours (duotone), `ready`, milestone M-4 (release 1.2.0); F-028 Replace a colour, `draft` (open questions Q5–Q7), milestone M-5 (release 1.3.0). Roadmap gains M-4 and M-5; `_index.md` updated.
- RULE-24 (new): the colour tools' ranges, defaults and units, the eight colour ranges, the full order applied (colour replace → Temperature/Tint → tone → Saturation/Vibrance → colour mixer → colour pop → look → split toning → duotone → Fade, Sharpen, Vignette, Grain, each with its reason), quality bars (identity at defaults ΔE00 < 0.5; greys untouched by mixer, pop and replace; hue-ring and grey-ramp smoothness; 8-bit within ΔE00 1; export within NFR-08), and reset, copy, compare and history. RULE-25 (new): colour replace and the eyedropper (pointer, touch magnifier, keyboard marker).
- Shipped rules extended (behaviour of existing projects unchanged, since every colour tool defaults to no change): RULE-08 points to RULE-24 for the order and adds the colour tools to Reset all, Apply to all, Copy, Paste and Compare (F-007.R3, F-007.R4, F-007.R7); RULE-09 look thumbnails include the colour tools; RULE-20 gives the eyedropper marker its keys; RULE-23 clears copied colour tools. NFR-03's load now includes every colour tool on.
- Domain: ENT-Clip gains optional colour tools; `project.schema.json` gains the optional clip property `colourTools` (`mixer`, `pop`, `splitToning`, `duotone`, `replace`) and the defs `hex`, `colourRange`, `mixerRange`, `hueDegrees`, `colourTools`. Glossary: Colour tool, Colour range, Colour mixer, Colour pop, Split toning, Duotone, Colour replace, Eyedropper, Colour picker.
- Experience: CMP-ColourPicker (new, `ready`); CMP-Inspector gains the collapsible colour-tool groups (wide and narrow sheet), Reset all and footer behaviour, and accessibility notes; CMP-Preview gains "picking a colour" and compare without colour tools. copy.md: new "Colour tools (D-053)" section (en-US, vi-VN); COPY-action.copy_look note. looks.md: "Duotone pairs" (six pairs, owner sign-off in design).
- Technical: ADR-0017 (proposed) — the tools run in the one grade pass in OKLab/OKLCh with a per-clip hue table, analytic split toning, duotone and colour replace, an eyedropper read-back of the source stage, a budget of +2 ms per 1080p frame on the reference phone, pending spike SP-colour-tools. MOD-Compositor notes it.

## 2026-11-25 — Released 1.1.0 to production (D-052)
- `v1.1.0` (the `v1.1.0-rc.1` build, unchanged) is live at `https://clip-maker.tarokit.app`, replacing 1.0.0; no music ships. Checks: `.build-my-app/reports/deploy-1.1.0.md`.

## 2026-11-25 — Release candidate 1.1.0 (D-052)
- F-011, F-015, F-020 and F-021 rebuilt for D-052 and `shipped`. Version 1.1.0, candidate `v1.1.0-rc.1` (local tag); verification in `.build-my-app/reports/release-1.1.0.md`.

## 2026-11-25 — Music only from the user's own files (owner decision D-052)
- The bundled music pack is removed, so no content-ID claim can come from tracks the tool ships. Music now comes only from the user's own audio files.
- F-011 (`shipped` → `ready`, to be rebuilt): R1 rewritten — COPY-action.music opens the file picker for audio files (the RULE-01 audio types); each chosen file goes through the F-001 intake, is listed in the media panel, and is placed on the audio track per RULE-12 at the playhead, several files in the order given (one after another), as one undo step, with the first new audio clip selected; cancelling changes nothing. AC1 and AC11 rewritten for the user's own file; AC12 (cancel), AC13 (several files), AC14 (no room: kept as a source, not placed), AC15 (several files running past the project end) and AC16 (a refused file among the chosen) added. R6, R7, AC6 and AC7 retired (IDs kept, never reused). The edge case for a shipped track that can't be read is gone; edge cases for refused files and video/photo files chosen through Music added. Frontmatter drops ENT-MusicTrack, CMP-MusicPicker and NFR-10; adds RULE-01, RULE-02, RULE-13 and CMP-MediaPanel.
- RULE-12 drops *Bundled music*; RULE-02 drops the sentence about shipped tracks. ENT-MusicTrack deprecated (heading kept); an audio clip's source is always an ENT-Source (`project.schema.json`). Glossary: "Bundled music" removed; "Audio track" reworded.
- CMP-MusicPicker `deprecated`. CMP-Toolbar: Music opens the audio file picker. CMP-Inspector "narrow sheets": the phone Audio sheet holds the selection's sound section, then a full-width Music button. style.md Audio tab, SCR-Editor component lists, CMP-StatusBar notices (no music section) and FLOW-01 step 7 updated.
- copy.md: COPY-music.title, COPY-music.preview, COPY-music.add, COPY-music.your_audio, COPY-music.your_audio_hint, COPY-music.stop and COPY-notice.music_unavailable retired (listed under "Retired (D-052)", no longer generated); COPY-action.music note updated; COPY-privacy.details no longer mentions music or the 12 MB download (en-US, vi-VN).
- F-001 scope, F-015 (the shipped-track export failure edge case removed), F-020 (notices list no music; R4, AC4) and F-021 (R1, AC1, AC2: no music to precache) updated; they go back to `ready` and are rebuilt and re-verified with F-011. NFR-01 and NFR-10 drop the music mention and budget.
- Technical: ADR-0013 amendment (music part withdrawn; looks unchanged); ADR-0008 amendment (item 7, picker audition, withdrawn); ADR-0014 amendment (assets are the look tables only; the dist-scan allow-list drops the tracks' pages); ADR-0015 amendment (no music in the manifest or precache). MOD-Assets (no music catalogue), MOD-Audio, MOD-Core (no `MusicTrack` type), MOD-App, MOD-Build (no `gen-music-manifest`) and architecture.md (size budget, module table, risk 10) updated. dependencies.md: DEP-14 and DEP-41 … DEP-49 `removed` (D-052), rows kept for history.

## 2026-11-25 — Released 1.0.0 to production (owner approval)
- `v1.0.0` (the `v1.0.0-rc.1` build, unchanged) is live at `https://clip-maker.tarokit.app`. ADR-0014 amendment: no separate staging host (owner decision D-051, replacing D-036's planned staging); production smoke checks passed (`.build-my-app/reports/deploy-1.0.0.md`).

## 2026-11-23 — Release candidate 1.0.0 (QA gate passed, owner approval)
- Version 1.0.0 (M-1): all 23 features `shipped`. QA gate G5 passed on 2026-11-23 (`.build-my-app/reports/gate-qa.md`); device and manual checks are waived by the owner (QA-5), not verified. The candidate is tagged `v1.0.0-rc.1` locally; nothing is published.

## 2026-11-20 — QA accessibility fixes (owner decisions QA-1, QA-2)
- RULE-20 *Scope* (QA-1, WCAG 2.1.4): single-character keys (letters with or without Shift, =, +, -, ? and \\) act only while focus is on the preview, the timeline or the transport controls; Space, arrows, Home, End, Delete, Backspace, Esc and Mod/Alt combinations keep their scope. F-017.R6 and F-017.AC8 (new); F-017.AC4 now starts from focus on the timeline or the preview.
- F-002.R4 (QA-2): Go to start and Go to end are visible on every layout, phones included; F-002.R8 (new): the time ruler is a slider for keyboard and assistive technology (arrows 1 s, Page Up/Down 10 s, Home/End), named the new COPY-timeline.ruler, with the time and length as its value. F-002.AC9, F-002.AC10 (new). CMP-Preview narrow transport: under 400 px the time shows the current time only. CMP-Timeline "Accessibility" says so.
- F-017.R7, F-017.R8 and F-017.AC9–AC12 (new): split, delete, duplicate, move, undo/redo (naming the step) and playback started by Space are announced politely; a rejected or limited typed value is marked invalid and announced. New "Announcements" strings in copy.md (en-US, vi-VN). NFR-06 wording follows; NFR-07 adds the landscape phone size and automated checks.
- Smaller accessibility fixes from the QA audit written into the specs: distinct names for the timeline toolbars (COPY-timeline.actions, COPY-timeline.zoom_label), a top-level heading COPY-app.name (SCR-Editor "Accessibility"), the main track's focus ring and reduced-motion touch scroll (CMP-Timeline), the narrow media sheet making the editor unreachable (CMP-MediaPanel), the short-landscape layout (CMP-Preview).

## 2026-11-20 — QA batch 2: CC0 music pack, security follow-ups, text-bitmap budget
- dependencies.md: the bundled music is nine CC0 1.0 tracks from Free Music Archive, downloaded with the owner's approval of 2026-11-20 (owner decision recorded in the registry's status paragraph). DEP-41 … DEP-49 are one row per track (title, author, source page, licence, date checked, saved dedication page in `licences/music/`, checksum, length, size), all `approved`; DEP-14 `approved` (9 tracks, 9,038,597 bytes, within NFR-10). The three generated placeholder tones and `scripts/make-placeholder-music.mjs` are deleted; `scripts/make-music.mjs` prepares the pack (ADR-0013 §2). The registry's stale status paragraph is corrected (licence audit finding 5).
- ADR-0014 amendment (owner decision QA-3, qa-security L4/I2/L1/L2): the page CSP adds `require-trusted-types-for 'script'; trusted-types clip-maker`, with one script-URL policy in MOD-Core (`scriptUrl`, own origin only) used for the workers and the offline worker; the Permissions-Policy denies the ad, attribution and cross-site storage features; `pnpm check:release` checks the production host list and tool origin, and the dist/ scan checks shipped code for network primitives and unlisted URLs. MOD-Core "Public surface" gains `scriptUrl` and `ownScriptUrl`.
- ADR-0009 note and MOD-Preview (owner decision QA-6, build question 172): the text-bitmap budget of §4 is built — an LRU by bytes over the engine's text bitmaps (32 MB phone, 96 MB laptop), layers near the playhead kept, the others rasterised again on a miss; what fits is chosen before rasterising, and a let-go layer is rasterised when it starts showing (review M1, m1). The note states that the export's text bitmaps are outside this budget (review m2).
- F-011.R6, CMP-MusicPicker, ENT-MusicTrack (owner decision QA-8, 2026-11-22): the picker shows each track's source as its name (Free Music Archive), linking to the track's page; the full address stays in the licence notices and the registry. ENT-MusicTrack gains the source's name.

## 2026-11-20 — Build gate passed (owner approval): M-1 features shipped
- All 23 M-1 features (F-001 … F-023) moved from `building` to `shipped` after the owner approved the build gate (`.build-my-app/reports/gate-build.md`). Automated acceptance tests pass on both test browser engines; F-001.AC9 and the other real-device checks are tracked in QA (phase 5).

## 2026-11-20 — Wave 5 owner review decisions
- Build questions 198, 201, 205 and 208 accepted as proposed by the owner (the other wave 5 questions, 197–209, were already decided, fixed or informational).
- RULE-20 *Scope* (question 205): timeline items (clips, text layers, audio clips) take Enter only, so Space plays and pauses there; Enter selects the item. CMP-TextEditor's "activated again" is now Enter or a second click.
- F-016.R3 and CMP-ExportProgress (question 201): a failed GIF export says the new COPY-error.export_failed_gif, a failed audio-only export the new COPY-error.export_failed_audio; video keeps COPY-error.export_failed.
- CMP-MediaPanel "Behavior" (question 208): Esc with focus in the wide drawer closes it and returns focus to Add media, unless an open dialog, popover or menu, or CMP-TextEditor, takes that Esc first.
- CMP-ExportPanel "Behavior" GIF range fields (question 198): accepted as written.

## 2026-11-19 — Build gate: deferred acceptance tests
- Tests only, no spec or behaviour change: F-019.AC2, F-019.AC6 and F-019.AC9 run embedded on the host harness (`tests/e2e/host-embedded.spec.ts`; AC9 uses the 60 s photo project that stands in for the NFR-04 fixture, as F-015.AC10 does), and F-022.AC4 compares en-US and vi-VN exports of the same project (`tests/e2e/language.export.spec.ts`), on both automated browser engines. F-001.AC9 stays a manual QA check on the reference phone (Q75).

## 2026-11-19 — Wave 4 owner review decisions
- DEP-13 `approved`: the owner signed off all 16 looks as generated (build question 146); `check-licenses --release` now fails only on the placeholder music (DEP-14, deferred to pre-release).
- RULE-08 *Drag detent*: a pointer drag of a −100…+100 adjustment slider landing within ±2 of the default lands on 0; keys and the number field still set ±1 and ±2. Built in MOD-App `beginAdjustDrag` (build question 140). CMP-Inspector "Behavior" says so, with the slider-movement rule of build question 129.
- F-004.R8 and AC11–AC13 (new): a photo's Duration row in CMP-Inspector's Edit tab (Position, Duration, Fades) and the phone Edit sheet, 0.1–60 s in 0.1 s steps; RULE-05 *Photo duration* gains the step. Built (build question 150).
- CMP-Inspector "clip Speed": a fade that a cross-fade replaces (RULE-10) is dimmed with the new COPY-fades.replaced and stays settable (build question 157); the quick fade toggles' behaviour is written there (build question 151).
- F-011 and F-015 edge cases: an export whose bundled track can't be read fails with COPY-notice.music_unavailable and is never made without the track (build question 190).
- Proposals accepted as written (build questions 122–192): F-004.R4 shows the item's length and end time (124); RULE-07 *Position* limit (132); RULE-08 *Quality* and F-007.AC2 name the frame the export encodes, with the file within NFR-08 (145); F-007.AC8 wording (141); RULE-09 *Intensity* starts at 100 for another look (147); RULE-11 *Size* in whole percent and the text nudge (161, 166); RULE-14 *On narrow layouts*, RULE-21 *Timeline* and F-013.R2 (174); RULE-20 *Edit* Mod+C with page text selected (144); CMP-Inspector "clip Adjust" Apply to all with one clip (139), "narrow / Adjust sheet" (138) and "text layer" Reset scope (162); CMP-LookGallery **unavailable** (149); CMP-Preview "clip selected" (133) and "text selected, moving" (165); CMP-TextEditor "Behavior" (160, 163, 164); CMP-Timeline "wide / default" availability (122), "narrow / sheet open" rows and Cross-fade tile (128, 135, 150, 152, 153), "cross-fade" chip (154), "narrow / no sheet" pill (173), "Behavior" popover focus and text-lane rows (155, 167). Recorded as accepted without a spec change: 127, 134, 168, 172, 176, 178, 181, 184, 191, 192.
- `.build-my-app/reports/build-spec-questions.md` gains "Manual device checks (QA)", the real-device checks noted in the questions.

## 2026-11-19 — F-015 building
- F-015 set to `building` (phase 4, wave 4).
- COPY-export.progress_starting added: CMP-ExportProgress hides the time remaining until its first estimate (F-015.AC12), so the progress line needs a form without it (build question 181). COPY-export.size_unit added: the "MB" after the custom size field, drawn on the CMP-ExportPanel board without a COPY ID. COPY-export.target_unknown (a size target whose check failed, with COPY-action.try_again) and COPY-notice.busy_exporting (files dropped or pasted while exporting) added after the F-015 review (build question 181).
- Proposed for the owner (build question 190): an export whose bundled track can't be read fails with COPY-notice.music_unavailable and is never made without the track (extends question 120; build question 190).
- MOD-Project "Public surface": `exportMark()`; `markExported(kind, mark)` marks the project as it was when the export started, so a change landing during the export stays unexported (RULE-19; build question 182).

## 2026-11-19 — F-013 building
- F-013 set to `building` (phase 4, wave 4); it stays `building` until the owner answers build questions 173, 174 and 176 (Snapping and Fit on the phone's zoom pill, the centred playhead on narrow layouts only, what snaps).
- MOD-Timeline: a pinch zooms around the pinch point (F-013.AC4), so on phones it moves the time under the centre line and scrubs; "Public surface": the `zoom`, `snapping` and `playing` signals and the view's `zoomIn`, `zoomOut`, `fit`, `scrollToPlayhead` and `nav` (build question 175).

## 2026-11-19 — F-010 building
- F-010 set to `building` (phase 4, wave 4); it stays `building` until the owner answers build questions 160–168 (editing a layer away from the playhead, the text nudges, the text Reset, editing from the keyboard, styling while editing, selecting and scaling text in the preview, whole-percent sizes, the drawing details, the phone editing layout).
- MOD-Preview "Public surface": `rasteriseText(layer, W, H)` (an output size, not a scale: wrapping needs the frame's width), `textBitmaps`, `layoutText`, `fontOf`, `textSync`, and the text move geometry; MOD-Engine: `setTextBitmaps` takes `keep`.

## 2026-11-17 — F-009 building
- F-009 set to `building` (phase 4, wave 4); it stays `building` until the owner answers build questions 150–155 and 157 (a photo's Duration row, the quick toggles, the phone Fades row and Cross-fade tile, the add chip's visibility and size, the popover's details, a fade a cross-fade replaces).
- copy.md: new COPY-fades.unit ("s"), the seconds symbol after fade and cross-fade lengths (build question 156).
- MOD-Timeline "Public surface": `deps.crossFade` (each join's state and the add / open actions); the length popover is MOD-App's.

## 2026-11-17 — F-008 building
- F-008 set to `building` (phase 4, wave 4); it stays `building` until the owner signs off the 16 looks (build question 146, DEP-13 then `approved`) and answers build questions 147–148.
- DEP-13 authored: 16 looks as parametric transforms (`scripts/make-looks.mjs`) → `.cube` → 33³ 8-bit PNG strips with checksums (`src/assets/looks/looks.json`), 167,723 bytes; read at start-up after the first render and precached (ADR-0013 §5). The `.cube` sources are regenerated by the script and not committed (their checksums are).
- MOD-Plan `thumbnailPlan` takes the playhead; MOD-Engine `previewLook` / `lookThumbnails` / `lookThumbnail`; MOD-Preview `setLookPreview` / `lookThumbnails`; MOD-Assets `looks(decode)` (module "Public surface" sections).
- Size gate: the look strips are their own group (≤ 0.5 MB) and fonts + looks ≤ 1.5 MB (architecture.md "Size", NFR-10); the dist scan admits a PNG only as a strip of the checked looks pack.
- F-006: the Offset X and Y fields (negative values) use the text keyboard, as F-007's signed fields do.
- F-008 review: MOD-Engine `lookThumbnails` takes the tile size and reports `lookThumbnailsDone`; `releaseThumbnails` frees the thumbnails' context when the gallery closes (NFR-05). Build question 149 proposes a state for a look that could not be loaded.

## 2026-11-16 — F-007 building
- F-007 set to `building` (phase 4, wave 4); it stays `building` until the owner answers build questions 138–141, 144 and 145 (Mod+C over selected text, the 8-bit export bound on tinted greys, the phone Adjust sheet, Apply to all with one clip, the slider’s pointer resolution, AC8’s export wording) and AC6's NFR-03 half is measured on the reference phone.
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

## 2026-11-19 — F-018 build (wave 4)
- F-018 edge cases: New project while files are being checked drops the batch (files already checked are not added); New project closes an open export panel, keeping its settings (RULE-23; build question 192).

## 2026-11-19 — F-016 build (wave 5)
- CMP-ExportPanel "Behavior" (GIF range): the frame separators of the From/To fields, when a field takes its time, how one end follows the other, when the range is worked out from the playhead, that Change settings keeps it, and how it follows a project that gets shorter or grows past 15 s (build question 198).
- MOD-Export: GIF settings carry the range's end; the panel's GIF estimate from three encoded frames; the GIF loop yields so a cancel deletes its scratch; the capability record without a video format keeps GIF and WAV available (F-023.R5; build questions 197, 199, 200).

## 2026-11-19 — F-017 build (wave 5)
- RULE-20 *Scope*: tab lists (the inspector's clip tabs, the phone tab bar) get Left, Right, Home and End; a toolbar's buttons get Left and Right, which move between them. *View*: + zooms in too. =, - and ? follow the character the layout types (letters keep the US position) (build questions 102, 203, 204).
- CMP-Toolbar and CMP-Timeline "Accessibility": each toolbar is one Tab stop with Left/Right roving focus; style.md D-038: the phone tab bar is one Tab stop, arrows move between tabs and Enter or Space opens one (build question 204).
- MOD-Keys public surface: the shortcut list (`HELP_GROUPS`, `keyCaps`) comes from the key map itself.
