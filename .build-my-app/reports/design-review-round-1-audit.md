# Design audit, round 1 (Clip Maker)

Scope: 47 boards in `design/canvas/project/*.dc.html`, read from source (no rendering). Checked against specs/, copy.md, tokens.json, style.md, adapters/design.md. Scripts and raw results are in the session scratchpad (copy_audit.py, copy2.py, tok.py, role.py). No design or spec files edited.
Severity: B = blocker (missing state/requirement or wrong behaviour vs spec), M = major, m = minor. Paths are relative to `design/canvas/project/`.

## Totals
B 6, M 13, m 12.

## Method results that came back clean
- Every `data-copy` ID exists in copy.md (0 unknown IDs in 47 boards).
- Colour roles: every `--role:#hex` in `.tk-dark` / `.tk-light` equals tokens.json (both themes and the `--txt-*` palette): 0 mismatches. No rgb()/hsl()/named colours.
- Off-token hex values are all sample media (sunset/city/picnic gradients, e.g. #F6A15E #7B4A7C #2A2F3A #9DB4CF #5C6B80 #1E2B45 #BFE3A2 #6FAF6A #3E6B3E #FFE3A3 #E5735F #2B3A63 #22304D #0F1726 #2F3644 #1E222B #C9D3DF #E8E2C8 #3A4458 #7D8FA6 #8FCB7E). "#116600" reported by a naive scan is a false positive (3-digit match inside an entity).
- All 47 files are in canvas.json; `<title>` equals canvas title except SCR-Editor_limits_wide. FLOW-01 chain step1 to step9 and back to step1 is linked; steps 1-9 match the flow spec (F-023.R1, F-001.R1/R3, F-012.R1, F-004/F-003.R3, F-008.R2/F-007.R1/R4, F-010, F-011, F-002.R2, F-015.R1/R5).
- Toolbar (wide/compact), inspector chrome and timeline lanes are consistent across Main, default/selected/compact and FLOW boards.

## Coverage matrix: SCR-Editor states x viewport (dark + light panels in each unless noted)
| State | wide | narrow | compact | Note |
|---|---|---|---|---|
| empty | yes | yes | - | |
| default | yes | yes | yes | |
| selected | Main | yes (+ _vi, dark only) | yes | clip selected only; text/audio selected never shown on a screen |
| editing-text | yes | yes | - | |
| playing | yes | yes | - | |
| adding | yes | yes | - | |
| exporting | yes | yes | - | |
| dragging-file | yes | yes | - | |
| exporting-setup | partial (inside limits_wide, docked) | NO | - | |
| result | partial (limits_wide only) | NO | - | COPY-notice.added never on a screen |
| export-error | NO | NO | - | only in CMP-ExportProgress |
| SCR-Unsupported default | yes | yes | - | |

## Findings
| Frame | Finding | Spec ID | Sev |
|---|---|---|---|
| SCR-Editor_*_narrow (adding, default, dragging-file, editing-text, empty, exporting, playing, selected, selected_narrow_vi) | No CMP-StatusBar row on any narrow editor screen (grid is toolbar/preview/transport/timeline/sheet/tab bar). Privacy badge, GitHub link and licence notices are not visible on narrow; only dragging-file_narrow shows the badge, inside the overlay. Fix: add a 28 px status row (or badge strip above the tab bar) per CMP-StatusBar narrow 390/320. | F-020.R1-R4, SCR-Editor region 6, CMP-StatusBar | B |
| SCR-Editor_*_narrow vs CMP-Toolbar | Narrow top bar is [New project "+", Undo, Redo, Export]; CMP-Toolbar narrow is [Add media, Undo, Redo, More, Export]. No More menu on any narrow screen, so Keyboard shortcuts, Licences and Source are unreachable; the "+" icon is labelled New project but reads as Add media (Add media sits in the Frame sheet header). style.md "Narrow" also says close/new, so the specs conflict. Fix: pick one in the specs, then align boards (recommend CMP-Toolbar). | CMP-Toolbar, style.md Layouts, F-017.R3, F-020.R4 | B |
| SCR-Editor_*_narrow | No entry point for Music on narrow. Tab bar is Edit/Sound/Text/Looks/Adjust; CMP-Toolbar says Music and Add text move to the tab bar, style.md omits both. CMP-MusicPicker narrow sheet is orphaned. Fix: add a Music tab/entry and decide where Add text lives. | F-011.R1/R6, CMP-Toolbar, CMP-MusicPicker | B |
| SCR-Editor_selected_narrow, CMP-Inspector | Narrow selected-state tool sheets are not designed: Edit (delete, duplicate, move earlier/later, Start here/End here, cross-fade), Adjust (Hold to compare, Apply to all, copy/paste colour, reset), Position (nudge, scale), Speed/Fades, Text (position, bring forward/send back, time earlier/later), photo Duration. Only Looks (screen) and Frame/Sound-muted (CMP) exist. Duplicate and cross-fade have no narrow control anywhere; zoom controls exist only in the CMP-Timeline narrow cell, not in screens; compare has no narrow control. Fix: add narrow sheets for each tab and show them in the selected/editing-text narrow boards. | F-003.R6, F-006.R5, F-007.R4/R7, F-009.R2, F-010.R8, F-011.R8, RULE-21, NFR-06 | B |
| (missing boards) | No SCR board for exporting-setup narrow, export-error (either viewport: COPY-error.export_failed/interrupted/no_space) or result narrow. SCR-Editor_limits_wide mixes result + export-setup + slow-device and is not a state name. Fix: add SCR-Editor_export-setup_narrow, SCR-Editor_export-error_wide/narrow, SCR-Editor_result_wide/narrow (notice.added + length_limited + refused_list); rename limits_wide. | SCR-Editor States table, F-015.R6, CMP-ExportProgress | B |
| SCR-Editor_*_narrow (10 boards incl. _vi) | Touch targets under 44 px: Export `.btn.fill` is 36 px high; slider knob 24 px in a 28 px row (selected_narrow, _vi); background swatches `.sw` 24 px (default/adding/dragging/exporting narrow); notice buttons `.tbtn` 28 px (adding_narrow, exporting_narrow Cancel). Fix: min 44 x 44 hit area (padding or pseudo-element) for each. | RULE-21, NFR-06, size.touchTarget | B |
| 17 look names (all boards with look thumbnails: Main, selected_compact, selected_narrow, CMP-LookGallery, CMP-Inspector, FLOW 5) | Look names are marked `data-sample` although COPY-look.* are defined in copy.md. 17 IDs never used: 16 COPY-look.* plus COPY-text.field. Fix: use `data-copy="COPY-look.natural_warm"` etc.; give the text field its COPY-text.field label. | copy.md Look names, F-008.R1 | M |
| Main.dc.html | Inspector group headings "Light", "Colour", "Effects" are hard-coded with no ID (Light/Colour have COPY-adjust.group_light/colour; selected_compact uses them; "Effects" has no COPY ID and compact has no such group). Fix: data-copy on the first two; add an ID to copy.md for the third or drop the group. | RULE-08, copy.md | M |
| All wide boards + FLOW 1-9 | Status bar facts "9:16 · 30 fps · 00:58:00" are plain text without `data-copy="COPY-status.facts"`. Also Main aria-labels "Editor", "Preview at ...", "Previous frame", "Play", "Next frame", "Full screen", "Clip" and wide-board "Editor" lack data-copy (IDs exist). Fix: add attributes. | COPY-status.facts, COPY-toolbar.label, COPY-preview.label, COPY-action.* | M |
| SCR-Editor_selected_narrow.dc.html | Tab "Edit" and aria-labels Play/Full screen lack data-copy (COPY-inspector.edit, COPY-action.play, COPY-action.full_screen). Light intensity row etc. fine. | copy.md | m |
| SCR-Editor_default/adding/dragging-file/exporting_narrow | Swatch aria-labels are lowercase English ("white", "black") marked data-sample instead of COPY-colour.*. They are UI labels, not sample content; this breaks vi-VN. | COPY-colour.*, F-022.R1 | M |
| SCR-Editor_default/adding/dragging-file/exporting_narrow | Background palette shows 7 of the 10 RULE-11 colours (blue, purple, pink missing from markup) plus Blur; CMP-Inspector vi sheet shows all 10. | F-012.R3, RULE-11 | M |
| CMP-MediaPanel.dc.html (+ FLOW 2) | Row button reads "Place again"; COPY-media.place_again is "Add to timeline" (vi "Thêm vào dòng thời gian"). The aria-label and data-copy disagree with the ID text. | COPY-media.place_again, F-001.R4 | M |
| SCR-Editor_empty_wide.dc.html | Hint reads "or drop files here"; COPY-empty.drop_hint is "Or drop or paste files here" (paste is F-001.R1). Production notes record the conflict. | COPY-empty.drop_hint, F-001.R1 | M |
| CMP-LookGallery (narrow vi), SCR-Editor_selected_narrow_vi | Tab/title shows "Bộ lọc màu"; copy.md COPY-looks.title is "Bộ lọc" (short for 320 px). Board is stale vs copy. | COPY-looks.title, F-022.R6 | M |
| CMP-Inspector, selected_compact, default_compact | Region aria-label "Inspector" carries COPY-inspector.frame / label (copy text "Frame"/"Clip"). Other composed labels: "Reset Brightness" (COPY-action.reset), "Exact speed", "Placement mode", "Text layer", "Audio clip". Fix: either add region/label IDs or use the IDs verbatim. | adapter Copy rule | m |
| SCR-Editor_limits_wide, CMP-Notice, SCR-Unsupported_* | Straight vs curly apostrophes (Couldn’t, can’t) differ from copy.md; "Cross-fade 0.5 s" appends a value to COPY-action.add_crossfade (use a separate data-sample span); "Size target in MB" aria-label vs COPY-export.size_custom_label "Size limit in MB"; "Playing" live-region text is under COPY-action.play. | copy.md | m |
| All 47 boards | Off-token sizes. Font sizes 10.5 (29 boards), 11 (29), 11.5 (18), 12.5 (20), 19 (20) px are not in font.size (12/13/14/15/16/17/20/24). Radii 1-6, 8, 28 px are not tokens (only 7, 10, 999). Spacing 6/10/14/2/5/18 px in about 1,230 gap/padding/margin declarations (space scale is 4/8/12/16/20/24/32...). Fix: map to nearest token or add tokens (6, 10, 14 are the common gaps). | tokens.json font.size, radius, space | M |
| 29 boards (all but CMP-DropOverlay) | Main-track clip height 56 px and audio clip 28 px vs size.timelineTrack 40 px and size.timelineLane 24 px (CMP-DropOverlay uses 40/24). Inspector tab row 40 px vs size.tab 32 px; transport round button 36 px (no token). | tokens.json size.* | M |
| 20+ boards | Raw on-token hex outside the role variables: #FFFFFF for preview handles (use `var(--previewHandle)`), canvas chrome #0B0812 and #9C92B0 (captions, 94 and 49 uses; acceptable as canvas chrome, but not themed), #FFB870/#000000 raw in 9 places. | adapter Tokens | m |
| CMP-Inspector vs Main / FLOW 5 / selected_compact | Adjust list is cut: Main and FLOW 5 stop at Vignette (no Sharpen, Grain, Fade); selected_compact stops at Vibrance. All 12 adjustments appear only in CMP-Inspector. | F-007.R1, RULE-08 | m |
| Main, selected_compact, all wide boards | Start here / End here (trim without dragging) and Reset placement are in CMP-Timeline and FLOW only, not in the selected wide/compact screens. Visible somewhere, but not in the screen state. | F-004.R6, RULE-21 | m |
| CMP-ExportPanel vs SCR-Editor_limits_wide | Spec conflict: SCR-Editor says export panel docks in the inspector column (wide); CMP-ExportPanel board is a popover anchored to Export; limits_wide docks it. Fix: align CMP-ExportPanel spec/board with SCR-Editor. | SCR-Editor exporting-setup, CMP-ExportPanel | M |
| CMP-Inspector | "All original sound muted" (COPY-action.unmute_all) exists only as a narrow sheet; no wide cell. MediaPanel "hover" variant has no labelled cell. | F-011.R4, CMP-Inspector, CMP-MediaPanel | m |
| CMP-Inspector | Narrow sheets only for Frame (vi) and Sound muted (see B above); wide variant rows otherwise all present. All other CMP variant rows are present in both themes (Toolbar, Preview 10/10, Timeline 11/11, ExportPanel 10/10, ExportProgress 7/7, Notice 7/7, TextEditor, StatusBar, MusicPicker, ConfirmDialog, DropOverlay, EmptyState). | CMP-* Variants | m |
| CMP-ShortcutHelp | mac variant shown only in dark, other systems only in light (OS and theme conflated); each should appear in both themes. | CMP-ShortcutHelp | m |
| FLOW-01_step1..9 | One theme only (dark); no light panel. Flow "Exits & failures" (close-page warning, export failure retry) not drawn. | adapter Naming/Review, FLOW-01 | m |
| SCR-Editor_selected_narrow_vi | vi-VN dark only (390 and 320 px); no light. vi-VN also missing for ExportPanel, ExportProgress, Notice, ConfirmDialog, ShortcutHelp, StatusBar (privacy badge at 320 not checked), TextEditor, Timeline and all wide screens. | F-022.R6, adapter Copy | M |
| 20 boards (every `.srcl` GitHub link in screens/FLOW) | Source link lacks `target="_blank" rel="noreferrer noopener"`; only CMP-StatusBar (and 3 screen variants) have it. | F-020.R3 | m |
| SCR-Editor_*_narrow | Inconsistent layouts: preview 336 px (default/adding/dragging/exporting) vs 380 px (others); sheet 168/212/236 px. Wide boards consistent. | style.md Layouts | m |
| Naming | SCR-Editor_limits_wide: "limits" is not a state in SCR-Editor States (canvas title "limits & errors" vs `<title>` "limits"); SCR-Editor_selected_narrow_vi: lang suffix not in convention; adapters/design.md lists narrow as 390 x 760 and 390 x 844 (boards use 844). Inspector tab names on wide (Position/Adjust/Looks/Speed/Sound; Text/Position/Fades) differ from style.md (Frame/Edit, Adjust, Looks, Text, Sound). | adapters/design.md, style.md | M |
| (no board) | No visible go-to-start/go-to-end control (keys Home/End only; no COPY ID). | F-002.R4, RULE-20 | m |
| CMP-Inspector Adjust | Values are static text beside sliders, not number fields (keyboard via slider only; one `<input>` in the board). | F-007.R6 | m |

## Requirements with no visible UI (summary)
Narrow: StatusBar/privacy, More menu (shortcuts, licences, source), Music entry, compare, Apply to all, copy/paste colour, duplicate, cross-fade, zoom, Start/End here, time earlier/later, text position, nudge, speed, fades, photo duration. All states: export-error and result on screens. Elsewhere: go-to-start/end.
Visible and correct: compare and Apply to all (wide), mute/unmute original, time earlier/later (CMP-Inspector, Timeline), size-target messages and Use {size} MB (ExportPanel, limits_wide), GIF range, audio format, licence notices (StatusBar), unsupported missing list (both viewports), centre-fixed playhead (narrow boards, left 194 px), RULE-21 timeline controls (CMP-Timeline narrow cell).
