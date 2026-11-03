# Design critique, round 2 (Clip Maker): re-review of the fixes

Input: 82 screenshots in `.build-my-app/reports/design-shots/` (52 boards), compared with round 1 (`design-shots-r1/`, `design-review-round-1-critique.md`) and checked against `specs/30-experience/style.md` (D-038 Narrow layout, D-039 Time, playhead and handles) and `specs/30-experience/tokens.json`.

Severity: **B** = blocker, **M** = major (users will notice), **m** = minor.

**Summary:** Round 1: 9 fixed, 6 partly fixed, 0 not fixed. New or remaining findings: **B 1 · M 5 · m 6**. Not ready for sign-off: the blocker (N1) and the inspector divergence (N5) must be fixed first. Everything else can be fixed in one pass.

---

## Part 1. Status of the round-1 findings

| # | Finding | Status | Evidence / what remains |
|---|---|---|---|
| 1 | Phone layout (D-038) | **Partly** | The top bar is now More, Undo, Redo, Export. The tabs read Edit, Audio, Text, Looks, Adjust. The status row and the timeline zoom buttons are in place. But an open sheet now hides the transport and the whole timeline (see N1). |
| 2 | Timecodes read as hours | **Fixed** | `0:04·12 / 0:58`, `about 0:38 left`, `Length 0:09`, `9:50·00 / 10:00`. |
| 3 | Narrow Edit sheet clipped | **Fixed** | Labels sit above the controls, the segments are equal width, swatches are a 6-column grid, and Add media is a full-width first row. |
| 4 | Inspector cut off | **Fixed** (wide) | The body scrolls, the footer is sticky, and the cut fades. On narrow the footer is now too tall (N2). |
| 5 | Playhead and handles collide | **Partly** | The head sits in the ruler, handles have a grip, and the empty state keeps the playhead at the centre. In light theme the playhead and handles are still the same token (`#A65305`), and the `bg` casing does not show on a white lane (N9). |
| 6 | Cross-fade "×" | **Fixed** | Bow-tie glyph everywhere. "+" appears on the join on hover only (CMP-Timeline). |
| 7 | Icon-only arrows | **Fixed** | Text-and-icon buttons on wide, labelled tiles on narrow, and "Add to timeline" in MediaPanel. |
| 8 | Notices | **Partly** | Error and warning use one recipe each, and the wide placement is bottom-centre. Still open: stacks cover the work, "Shortened" has two severities, and there are 3 progress layouts (N3). |
| 9 | Same component drawn differently | **Partly** | ExportPanel, the Done pill on wide, the selected chip and the plain inspector title are now aligned. The SCR wide inspector still differs from CMP/FLOW, and several narrow variants differ (N5, N7). |
| 10 | Labels overflow; text below 12 px | **Partly** | Labels stay on one line, the narrow lane gutter icons are added, and the text and audio chips are correct. "p 0:03" still shows a one-letter stub in every wide SCR board. `font.size.ruler` (10.5) and `2xs` (11) are still in the tokens and still used (N8). |
| 11 | Disabled states | **Fixed** | Empty Export uses `surface2` with a `muted` label and a reason. Exporting shows Export pressed with a progress underline. |
| 12 | Heavy sliders | **Fixed** | Ring thumbs, `accent` when changed and grey at the default. |
| 13 | Density | **Fixed** | MusicPicker uses a quiet "+" with Add on the active row only, the Looks categories are a pill segment, and speed is 6 equal segments. |
| 14 | Timeline proportions | **Fixed** | Clips are drawn at duration × scale, the wide timeline is sized to its content, the ruler is pinned, and the empty lanes say "Drop to add". |
| 15 | vi-VN fit | **Partly** | The 320 × 568 board now renders, the tabs fit, and CMP has vi cells. Clipping at 320 and some copy issues remain (N10). |

---

## Part 2. New and remaining findings (ordered by impact)

### N1. [B] Phone: an open tool sheet hides the transport and the timeline
**Boards:** `SCR-Editor_default_narrow`, `selected_narrow` (both themes), `selected_narrow_vi` (390 and 320).
- In the default state the Edit sheet is already open. The board shows no timeline, no playhead and no Play button at all.
- In the selected state, Split, Start here and End here act on the playhead, but the playhead is not visible.
- In the 320 × 568 board the preview drops to about 170 px, and the timeline is still hidden.
- D-038 lists Preview, then the timeline, then the tab bar. The sheet was meant to sit above the tab bar, not to replace the editing surface.

**Fix:**
- Keep the transport (44 px) and a timeline peek always visible: the ruler plus the main track, 20 + `timelineTrack` 56 = 76 px.
- Dock the sheet between the timeline peek and the tab bar. Cap it at 40 % of the viewport, let it scroll inside, and give the remaining height to the preview (minimum 200 px at 844 tall, 120 px at 568 tall).
- Start the default state with no sheet open. The tab bar shows no active tab until the user taps one.

### N2. [M] Phone Adjust sheet: the footer takes a third of the sheet
**Board:** `selected_narrow` light (Adjust).
- The footer is four 44 px buttons in a 2 × 2 grid, about 110 px.
- That leaves room for only 3 of the 12 sliders.

**Fix:** Use a single 44 px footer row: "Hold to compare" (flex), "Apply to all clips", and a 44 × 44 overflow icon button that holds Copy colour and Paste colour. Use `space.2` gaps.

### N3. [M] Notice stacks cover the video and the timeline, and there are still several variants
**Boards:**
- `result_wide_light`: 3 notices cover about 190 px of the roughly 300 px 9:16 frame.
- `result_narrow`: 2 notices cover the main track and the text lane.
- `adding_narrow`: the progress notice covers the text and audio lanes.
- CMP-Notice: the error list shows 10 items in a box about 250 px tall.

**Variants still in use:**
- "Shortened to keep the project within 10 minutes" is neutral info in CMP and in `result_wide`, but `warnBg` with a warning icon in `result_narrow`.
- The progress notice has 3 layouts: wide screen (spinner, no filename), narrow screen (spinner, filename above the bar) and CMP (upload icon, filename below the bar).

**Fix:**
- Show at most 2 notices at once. Fold the rest into a "+N more" chip (`surface`, `lineStrong`, `font.size.xs`).
- Success notices dismiss themselves after 4 s.
- The error list shows 3 items, then a "Show all (10)" text button.
- On phones, anchor the stack to the bottom of the preview, `space.2` above the transport, so it never covers the lanes. This needs a one-line change to D-039, which currently says "above the tab bar".
- "Shortened…" uses the info recipe everywhere.
- Use the CMP progress layout in every screen.

### N4. [M] Export errors don't say what happened
**Boards:** `export-error_wide_light/dark`, `export-error_narrow`, CMP-ExportProgress.
- Every dialog is titled just "Export". The outcome is only in the body text.
- The title is `fg` on wide and `danger` on narrow.
- The wide screens use a generic "!" icon, while CMP uses a different icon for each cause.

**Fix:**
- Make the title the outcome: "Export stopped", "Not enough space", "Export failed" (vi: "Đã dừng xuất", "Không đủ dung lượng", "Xuất thất bại").
- Title in `danger` `font.size.md` semibold, in every layout.
- Use the CMP icon for each cause.

### N5. [M] The wide inspector in the screens still differs from CMP and FLOW (rest of round-1 #9)
**Boards:** `Main_*`, `selected_compact_*` versus CMP-Inspector, CMP-LookGallery and FLOW-01 step 4/5.

| | SCR wide and compact | CMP and FLOW |
|---|---|---|
| Tabs | Position, Adjust, Looks, Speed, Sound (5) | Edit, Adjust, Looks, Sound (4) |
| Adjust panel | One group, Temperature first, with a "LOOKS Warm · 80" row | Grouped Light / Colour, Brightness first |
| Footer | 2 × 2 grid with text labels | Hold to compare, eyedropper icon, clipboard icon, Apply to all |

Developers will build only one of these.

**Fix:**
- Use the CMP 4-tab set. It already fits vi-VN in 288 px, and 5 tabs would not.
- Pick one Adjust order (RULE-08) and apply it to both boards.
- Footer: Copy and Paste as labelled buttons. A bare eyedropper reads as "pick colour".

### N6. [M] Export setup, "size target unreachable" state is unclear
**Board:** `exporting-setup_wide_light`.
- The warning is about the "Other: 1 MB" field, but that field is scrolled under the sticky footer.
- Quality shows no selected segment.
- The footer Export is drawn as a quiet button, neither clearly disabled nor primary. Unlike CMP, there is no Cancel.

**Fix:**
- When the warning appears, scroll the field into view above the footer and give it a `danger` 1 px border.
- Keep the Quality selection visible.
- Footer, same as CMP: Cancel, then "Use 3 MB" (outlined `accent`), then Export using the disabled recipe (`surface2`, `muted`).

### N7. [m] Narrow and CMP variants still differ
- **More icon:** the screens use a kebab (⋮), CMP-Toolbar uses a hamburger (≡). Use the kebab.
- **Edit sheet:** the screens use 4-column icon-over-label tiles, CMP-Timeline uses 2-column labelled rows. Pick one.
- **Text editing:** in `editing-text_narrow` the filled Export stays in the top bar and Done sits in a strip above the keyboard. In CMP-TextEditor the top bar becomes Undo, Redo, Done. Use the CMP version (a round-1 keep).
- **Empty narrow:** the reason next to a disabled Export is squeezed into the top bar in 2 lines at about 10 px. Put it in a row below the bar, as CMP-Toolbar does, at `font.size.xs`.

### N8. [m] Clip labels and the small mono tokens
- **Short clips:** the wide SCR boards show "p 0:03". Apply the under-48 px rule from CMP-Timeline: duration only, "0:03".
- **Label position:** the clip label sits above the thumbnails in CMP and on narrow, but below them in wide SCR. Pick one.
- **Tokens:** retire `font.size.ruler` (10.5 px) and `font.size.2xs` (11 px), or mark them as non-text. Ruler and clip labels move to `font.size.xs` (12 px) mono.

### N9. [m] Light theme: the playhead and trim handles share one colour
- `color.light.playhead` and `color.light.handle` are both `#A65305`.
- The 1 px `bg` casing does not show on the white or lilac lanes. In `Main_light` and CMP-Timeline (clip trimming), the playhead and the handle still read as one mark.

**Fix:** Set `color.light.playhead` to the `fg` ink, or add a 1 px `onAccent` inner keyline to the handle tabs, so the two differ by more than shape.

### N10. [m] vi-VN details
- **320 × 568 Looks sheet:** "Đen trắng", the 5th tile and "Ấm · 80" run to the right edge with no padding. Add `space.3` side insets, and use 4 tile columns below 360 px.
- **Fades row:** the row label is "Mờ dần", the same as the Fade-out option. Use "Hiệu ứng mờ" for the row.
- **Decimals:** speed chips use "0.25×" and "1.5×" while fades use "0,5 s". Use "0,25×" and "1,5×".
- **Tile wrap:** "Kết thúc tại đây" wraps to 2 lines and makes uneven tiles. Shorten to "Kết thúc" and "Bắt đầu", or fix every tile at 2 lines (56 px).

### N11. [m] Sample data contradicts itself across boards
- The same clip is `street.mov · 0:37` (wide) and `street.mp4 · 0:38` (narrow, CMP).
- The same 1080 Balanced export is "About 42 MB" (wide) and "About 24 MB" (narrow).
- After the same add, the result says "Added 3 files" on wide and "Added 5 files" on narrow.

**Fix:** Use one fixture for every board. Reviewers and QA will report these as bugs.

### N12. [m] Polish
- Phone zoom buttons cover the audio waveform (`playing_narrow`). Put them on a `chrome` pill and add a 28 px bottom inset to the lanes.
- Wide CMP-LookGallery category row: "Black & W" is cut off with no fade. Add a 24 px trailing fade.
- CMP-Timeline trim tooltip "Length 0:09 0:30": label the second number, as in "Length 0:09 · ends 0:30".

---

## Keep these patterns and use them everywhere
- **The D-039 time grammar** (`0:04·12` with a muted frame part, `m:ss` everywhere else). It reads well in both themes.
- **The refused-files error recipe** (`dangerBg`, `danger` title, `fg` list, semibold filenames) and the **disabled option with a reason** (struck 1440 / 2160).
- **Toolbar Export states:** pressed (outlined) while the panel is open, and a progress underline while exporting.
- **MediaPanel rows** with a labelled "Add to timeline", and the **MusicPicker** quiet "+" with Add on the active row only.
- **The narrow export sheet** (`exporting-setup_narrow`): full-width segments, and a footer with the size estimate and Export. Use it as the model for the other narrow sheets once N1 is fixed.
