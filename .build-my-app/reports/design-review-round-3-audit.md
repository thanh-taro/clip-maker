# Design audit, round 3 (Clip Maker, final verification)

Scope: 52 boards in `design/canvas/project/`. Method: scripted scans (COPY IDs, theme-variable values vs tokens.json, px values vs tokens, link chain, canvas.json) plus headless Chrome renders (sc-for templates expanded by script). No files edited. B blocker, M major, m minor.

## Totals
B 0, M 2 remaining, m 10. Round 2: 6 of 7 audit majors resolved (M6 partly); critique blocker N1 and majors N2 to N6 resolved except N5 footer (partly).

## 1. Round-2 status
| Item | Status |
|---|---|
| A-M1 result_narrow "Shortened" recipe | Fixed. Info recipe (surface, strong border, accent icon), same as CMP-Notice and result_wide. |
| A-M2 editing-text_wide font picker | Fixed. 2 x 2 "Aa" tiles in both themes. |
| A-M3 editing-text_narrow vs CMP-TextEditor | Fixed. Top bar Undo, Redo, Done; style bar Aa, colour, Style. |
| A-M4 narrow Audio/Text/Looks sheets | Fixed. default_narrow (Audio tab), editing-text_narrow (Text tab), selected_narrow (Edit, Adjust), selected_narrow_vi (Looks, vi); Looks in English on CMP-LookGallery narrow. |
| A-M5 Add media on narrow Edit sheet | Fixed. Full-width row at top; CMP-Toolbar now says "whether or not something is selected". |
| A-M6 export-error variants | Partly. Narrow fixed (3 variants x 2 themes, one dialog per panel, no_space present). Wide not, see M1. |
| A-M7 narrow export panel | Fixed. 40 % sheet (337 px at 844), sticky footer; spec row and CMP-ExportPanel cells updated (390 en cell 337 px, vi 320 cell at the 60 % rule). |
| N1 blocker, sheet hides transport and timeline | Fixed. Transport 44 and ruler plus main-track peek visible above every sheet; default has no sheet open; 320 x 568 vi board has peek and 60 % sheet. |
| N2 Adjust footer height | Fixed on narrow (one 44 px row: Hold, Apply, kebab). |
| N3 notices | Fixed. Max 2 plus "+1 more" chip, 3 items plus Show all, anchored above transport, one progress layout (icon, title, bar, filename below), Shortened = info. |
| N4 error titles | Fixed. Outcome titles in danger (Export failed / Export stopped / Not enough space), per-cause icons, wide and narrow. |
| N5 wide inspector divergence | Mostly. 4 tabs Edit/Adjust/Looks/Sound and Light/Colour order everywhere; footer differs, see M2. |
| N6 size target unreachable | Fixed. Field in view with danger border, Quality visible, footer Cancel, Use 3 MB, disabled Export. |
| N7 to N12 minors | Fixed: kebab More everywhere, New project icon, edit-sheet layout same on CMP-Timeline and screen, "0:03" short label, light handle #16111F (neutral, bg grip, never mango), 24 MB and street.mov everywhere, vi decimal comma, Hiệu ứng mờ, radius 4 gone, Black & White fits, adapters/design.md now 390 x 844, style principle 6 now says 2xs minimum. |

## 2. Regression checks
- COPY IDs: 0 unknown in 52 boards; spec_lint 784 IDs, 0 errors. Leaf-text scan: only unlabelled strings are sample data, FLOW annotations, key caps, and "Next step" / "Back to step 1" (FLOW chrome).
- Tokens: every theme variable equals tokens.json in dark and light (handle #EFEAF8 / #16111F, 0 mismatches, 0 rgb/hsl). Hex outside theme blocks is sample media gradients only. Font sizes and radii: 0 off-token. Spacing: -1 px offsets (12 boards, mostly borders), 42 px (CMP-Timeline), -56 px (exporting-setup_wide) only.
- Coverage: every SCR state has wide and narrow, dark and light; compact default and selected; Unsupported both. CMP variant rows all drawn (ExportPanel, Inspector, MediaPanel rows verified by caption or copy ID). vi-VN on SCR (selected_narrow_vi 390 and 320) and many CMP.
- FLOW 1 to 9: step n links to n+1, step 9 back to 1; all 52 boards in canvas.json, titles match file names.
- Cross-board: inspector tabs, font picker 2 x 2, notice recipe, export panel capped sheet, kebab More, neutral handles: consistent. Footer in M2 is the exception.

## 3. Remaining findings
| Frame | Finding | Spec ID | Sev |
|---|---|---|---|
| SCR-Editor_export-error_wide | Variants still split by theme: dark shows failed only; light shows interrupted and no_space stacked (two dialogs in one panel). R2 fix said one dialog per panel, all three variants in both themes (as narrow now does). Fix: three panels per theme, or stack of captioned frames, one dialog each. | F-015.R6, CMP-ExportProgress | M1 |
| Main, SCR-Editor_selected_compact, FLOW-01_step5 | Adjust footer uses icon-only Copy/Paste beside Hold to compare. CMP-Inspector.md and CMP-Inspector board: Hold to compare, then Copy colour and Paste colour as labelled buttons side by side, then Apply to all clips. Fix: redraw footer as in CMP-Inspector (3 rows) or amend spec and CMP together. | CMP-Inspector, COPY-action.copy_look / paste_look | M2 |
| SCR-Editor_exporting-setup_wide | Default only in dark, unreachable only in light. Add the other theme of each. | CMP-ExportPanel | m |
| SCR-Unsupported_wide | Same one-variant-per-theme split. | SCR-Unsupported | m |
| SCR-Editor_empty_narrow (dark) | Redo drawn brighter than Undo (both should be unavailable). | CMP-Toolbar | m |
| SCR-Editor_playing_narrow | Clip label clipped ("street.mo"); acceptable if the under-width rule is stated. | CMP-Timeline | m |
| selected_narrow, selected_narrow_vi | No Edit sheet with nothing selected (Add media, Add text only). | CMP-Toolbar | m |
| selected_narrow_vi (390) | "Kết thúc tại đây" wraps to 2 lines, uneven tiles. Shorten or set all tiles to 2 lines. | COPY-action.set_out | m |
| CMP-LookGallery 320 vi | Fifth tile cut at edge (reads as scroll hint; add a fade). | CMP-LookGallery | m |
| FLOW-01_step1..9, selected_narrow_vi | Dark only (adapter asks both themes). | adapters/design.md Review | m |
| selected_narrow_vi | Suffix `_vi` is not in the naming convention. | adapters/design.md | m |
| Tokens | font.size.2xs 11 and ruler 10.5 stay as text sizes (spec now allows). Accessibility owner to confirm. | style.md principle 6 | m |
