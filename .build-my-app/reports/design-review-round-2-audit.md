# Design audit, round 2 (Clip Maker)

Scope: 52 boards in `design/canvas/project/` (all in canvas.json, titles match). Method: scripted scan (COPY IDs, text vs copy.md, tokens, links) plus headless renders (CMP and wide boards expanded from their sc-for templates, since support.js is absent). No files edited. Severity: B blocker, M major, m minor.

## Totals
B 0, M 6, m 14. Round 1: all 6 blockers resolved; majors resolved except where noted below.

## Round-1 status
| R1 item | Status |
|---|---|
| B1 narrow status row | Fixed. Privacy badge and source icon on every narrow board except editing-text (keyboard replaces it, per spec). |
| B2 narrow top bar and More | Fixed (More, Undo, Redo, Export; 52 px). Icon mismatch, see m1. |
| B3 Music entry on narrow | Fixed (Audio tab). Sheet only on CMP-MusicPicker, see M4. |
| B4 narrow tool sheets | Mostly fixed. Edit (split, start/end, cross-fade, duplicate, speed, fades, position) and Adjust (compare, apply all, copy/paste) are on selected_narrow; zoom buttons present. Text and Audio tabs remain, see M4. |
| B5 missing state boards | Fixed (exporting-setup narrow, export-error w/n, result w/n; limits_wide gone). Gaps in M5. |
| B6 touch targets | Fixed (44 px for Export, knobs, swatches, notice buttons). |
| M look names, group headings, status.facts, colour labels, 10 colours, Place again, drop hint, looks.title vi | Fixed. |
| M ExportPanel docked vs popover | Fixed (docked wide). Narrow conflict is M6. |
| M off-token values | Fixed. 0 off-token font sizes; spacing and radii on tokens (new dense tokens). Only exceptions: CMP-Notice 4 px radius (m), and sample-media gradients and device frames. |
| M timecodes, playhead, handles, bow-tie, clip widths, labels | Fixed. No hh:mm:ss strings; clip widths match 18 px/s ruler. |
| M vi coverage | Partly: selected_narrow_vi (390 and 320) is dark only; no vi on wide screens (CMP boards have vi). |
| M naming | limits_wide fixed. adapters/design.md still says narrow 390 x 760 (Naming) and 844 (Viewports); selected_narrow_vi suffix still non-convention (m). |
| FLOW-01 1-9 | Chain 1 to 9 and back to 1 linked; steps match spec; failure path 9d drawn. Dark only. Close-page warning not drawn (m). |

## Clean checks
- COPY IDs: 0 unknown in 52 boards. Visible text matches copy.md except M/m items below (percent values are placeholders).
- Colours: every role variable equals tokens.json in both themes; only off-token hex is sample media (same 20 gradient colours). No rgb()/hsl().
- Spacing, radius and font sizes: 0 off-token values (incl. 2xs, xsPlus, ruler, preview, 0_5 to 3_5).
- GitHub links all have target=_blank and noopener noreferrer.
- Coverage: every SCR state has wide + narrow, dark + light (empty, default, selected, editing-text, playing, adding, exporting, dragging-file, exporting-setup, result, export-error); compact has default and selected.

## Findings
| Frame | Finding | Spec ID | Sev |
|---|---|---|---|
| SCR-Editor_result_narrow | "Shortened to keep..." drawn as warning (warnBg, accent icon). CMP-Notice and result_wide use the info recipe (surface, muted icon). Fix: restyle to info. | COPY-notice.length_limited, CMP-Notice info | M |
| SCR-Editor_editing-text_wide | Font picker is a one-row segmented control. CMP-Inspector text layer, CMP-TextEditor narrow and FLOW-01_step6 use the 2 x 2 "Aa" tile picker. Fix: redraw as 2 x 2 tiles. | CMP-Inspector, CMP-TextEditor | M |
| SCR-Editor_editing-text_narrow vs CMP-TextEditor | Screen: top bar More/Undo/Redo/Export, Done in the style bar, buttons "Aa Sans" and "Outline". CMP board and CMP-TextEditor.md: top bar Undo/Redo/Done, bar Font/Colour/Style. SCR-Editor.md (Phone editing-text) says Done in the style bar, so the specs conflict. Fix: choose CMP-TextEditor (Done in top bar), edit SCR-Editor.md, redraw the screen. | SCR-Editor, CMP-TextEditor | M |
| SCR-Editor narrow set | No screen shows the Audio tab (Music, your audio, selection sound), the Text tab (Add text, style, position, forward/back, time earlier/later), the Looks sheet in English, or text/audio/photo selections. They exist only in CMP-MusicPicker, CMP-Inspector, CMP-LookGallery. Fix: add Audio and Text sheets to selected_narrow (or a new selected-text narrow board). | F-010, F-011.R1/R8, CMP-Toolbar | M |
| SCR-Editor_selected_narrow (+ _vi) | Edit sheet with a clip selected has no Add media row; CMP-Toolbar says narrow Add media lives in the Edit sheet, so it is unreachable while something is selected. Fix: add the row at the top of the sheet, or state in CMP-Toolbar that it appears only when nothing is selected. | F-001, CMP-Toolbar | M |
| SCR-Editor_export-error_wide / _narrow | no_space (COPY-error.no_space) is not on narrow. Each variant appears in one theme only (wide: failed dark; interrupted + no space light; narrow: failed dark, interrupted light). In wide light, the second dialog overflows the preview into the inspector. Fix: one dialog per panel, all three variants in both themes (or add a variant strip). | F-015.R6, CMP-ExportProgress | M |
| CMP-ExportPanel vs SCR exporting-setup narrow | See ruling below. | CMP-ExportPanel, SCR-Editor | M |
| Narrow boards, CMP-Toolbar | More glyph: hamburger in CMP-Toolbar, kebab in every SCR narrow. Fix: use one (kebab suits "More"). | CMP-Toolbar | m |
| SCR wide boards vs CMP-Toolbar | New project has the document icon in CMP, none in screens; dimmed in empty_wide, not dimmed in CMP empty. | CMP-Toolbar | m |
| CMP-Timeline narrow Edit sheet vs SCR selected_narrow | Different layouts (2-column large rows vs 4-column grid, different order). Fix: copy the screen layout into the CMP cell (or the reverse). | CMP-Inspector note | m |
| SCR-Editor_selected_narrow_vi | vi dark only. "Mờ dần" vs COPY-inspector.fades vi "Hiệu ứng mờ". | COPY-inspector.fades | m |
| SCR-Editor_result_wide | "Couldn't add:" has no data-copy (COPY-error.refused_list). | adapter Copy | m |
| CMP-Inspector, CMP-LookGallery | Slider aria-labels (Brightness..., Intensity, Volume, vi) have no data-copy. | adapter Copy | m |
| CMP-DropOverlay, CMP-EmptyState (narrow cells) | Tab labels Edit/Audio/Text/Looks/Adjust lack data-copy. | COPY-tab.* | m |
| CMP-LookGallery (wide cells) | Category pill group clips "Black & White" at 288 px. | CMP-LookGallery | m |
| CMP-Notice | One 4 px radius (not a token; use radius.xs 3 or sm). | tokens radius | m |
| SCR-Editor_playing_narrow | Third clip reads "street.mp4 0:38" (elsewhere street.mov 0:37); zoom buttons cover part of text and audio lanes. | consistency | m |
| style.md principle 6 | Still says text never below font.size.xs, but 2xs 11 and ruler 10.5 are used for labels. Update the principle. | style.md | m |
| FLOW-01_step1..9, selected_narrow_vi | Dark only. | adapter Review | m |
| adapters/design.md | Narrow 390 x 760 (Naming) vs 844 (Viewports). | adapter | m |
| CMP-ExportPanel wide | Kind tabs span full width; the docked screen has them hugging left. | CMP-ExportPanel | m |

## Ruling: narrow export panel (open item)
Spec of record is the capped sheet (SCR-Editor.md exporting-setup: 40 %, scrolls; style.md and CMP-Inspector use the same cap). Keep SCR-Editor_exporting-setup_narrow as is (337 px at 844 px, body scrolls, sticky footer). Change:
1. specs/30-experience/components/CMP-ExportPanel.md, narrow row (line 25): "Full-height bottom sheet" becomes "bottom sheet capped at 40 % of the height; the body scrolls".
2. design/canvas/project/CMP-ExportPanel.dc.html, narrow cells (vi-VN 320, dark and light, now height 548): redraw at the capped height and add an en-US 390 cell at 337 px with the scroll fade.
3. Caution: at 320 x 568, 40 % is 227 px. Header, grabber and the footer with a message plus three buttons (vi target_unreachable cell) take about 170 px, leaving almost no body. Add a rule to the spec: the footer message scrolls with the body (or the cap rises to 60 % below 640 px height), then check the vi 320 cell.
