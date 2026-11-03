# Design critique, round 1 (Clip Maker): visual and UX quality

Input: 73 screenshots in `.build-my-app/reports/design-shots/` (45 boards), checked against `specs/30-experience/style.md` (incl. the D-038 Narrow layout), `specs/30-experience/tokens.json` and `adapters/design.md`. Spec-coverage gaps already in `design-review-round-1-audit.md` are not repeated. Known render clipping (vi 320 phone, CMP-Inspector right column, CMP-Timeline narrow, CMP-MediaPanel narrow, CMP-ShortcutHelp light) is a screenshot problem. I only mention it where it hides something I needed to judge.

Severity: **B** = blocker (users can't do the task, or the layout is wrong for the current spec), **M** = major (users will notice: confusion, misreading, lost controls), **m** = minor (polish).
Totals: **B 2 · M 11 · m 2** (15 findings, ordered by impact).

---

## 1. [B] Phone layout does not match the new D-038 structure, and the vertical budget does not fit
**Boards:** every `SCR-Editor_*_narrow` (default, selected, selected_narrow_vi, adding, playing, exporting, dragging-file, empty, editing-text), `CMP-Toolbar` narrow cells.
**Issues:**
- The top bar is `[+ , Undo, Redo, Export]`. D-038 calls for `[More, Undo, Redo, Export]`, with More as the first item. The "+" reads as Add media, not New project. CMP-Toolbar narrow has a kebab, but it sits next to Export on the right and the "+" is still there.
- The tab bar reads Edit / **Sound** / Text / Looks / Adjust. D-038 calls it **Audio**, and the Audio tab is now where Music lives.
- There is no one-line status row under the tab bar, and no timeline zoom controls in the timeline's corner.
- Height: the current boards give the preview about 420 of 844 px, plus a 230 px sheet. Adding a 28 px status row (`size.statusbar`) leaves no room unless the preview shrinks. At the 320 × 568 minimum, nothing fits as drawn.
**Why it matters:** The phone is half the audience. These boards are the template for every narrow state, so every one of them will be redrawn.
**Fix:**
- Top bar: 52 px tall (`size.touchTarget` + `space.1` × 2). Order: More (kebab, 44 × 44, leading), Undo, Redo, flexible gap, Export (filled, `accent`/`onAccent`, 44 px tall). Reuse the CMP-Toolbar "menu open" popover as is: `surface`, `lineStrong` border, 44 px rows.
- Tab bar: `size.tabBar` 56 px. Rename the tab to Audio.
- Status row: 28 px under the tab bar, `font.size.xs`, `muted` text plus the shield icon, and the source icon as a 44 × 44 hit area.
- Zoom: two 44 × 44 icon buttons on `chrome`, pinned to the timeline's bottom-right corner, `space.2` inset.
- Height allocation: top bar 52 + transport 44 + timeline about 140 (ruler 20, `timelineTrack` 56, `timelineLane` 24, `audioLane` 28, `space.1` gaps) + tab bar 56 + status 28. Give the remainder to the preview (minimum 200 px). Cap the sheet at 40 % of the viewport and let it overlay the timeline (with a drag handle to collapse it to a peek) instead of pushing the preview up.

## 2. [B] Timecodes read as hours
**Boards:** all of them. Main transport `00:04:12 / 00:58:00`, status bar `00:58:00`, trim tooltip `Length 00:09:00` (CMP-Timeline), FLOW-04 `Length 00:37:00`, and the worst case, `SCR-Editor_limits_wide_dark` with `09:50:00 / 10:00:00` and status `10:00:00`.
**Issue:** mm:ss:ff written with two-digit zero padding is the same shape as hh:mm:ss. A 58-second project reads as 58 minutes, and the 10-minute limit reads as 10 hours. The ruler uses `0:10` (m:ss), so one screen uses two time grammars.
**Why it matters:** This is the core number in a video editor. Users will misjudge length, limits and the trim result.
**Fix:**
- Durations and totals (status bar, `Length`, total time, media rows): m:ss (`0:58`, `10:00`).
- Current time in the transport: `0:04` in `fg` mono `font.size.sm`, with the frame as a separate `muted` span `·12f` (or `:12` at `font.size.xs`), so frames never look like seconds.
- Keep tabular digits. Apply the same pattern to the GIF From/To fields in CMP-ExportPanel.

## 3. [M] Narrow Edit sheet: controls are clipped and Add media is buried
**Boards:** `SCR-Editor_default/adding/dragging-file_narrow` (both themes).
**Issues:**
- "Original" is squeezed against the sheet edge.
- The background swatch row is cut off mid-swatch (cyan) at the right edge, with no scroll cue.
- Add media, the main way to start, is a small text link in the sheet header next to the "FRAME" label.
- The "Aspect / Frame rate / Background" row labels take about 100 px of a 390 px width.
**Fix:**
- Stack each label above its control (`font.size.xs`, uppercase, `muted`, `space.1` below).
- Aspect and frame rate as full-width equal segments, 44 px tall.
- Swatches in a wrapping grid of 6 columns × 44 px hit areas (24 px `size.swatch` visual), Blur last. Or a horizontal scroller with a 24 px `surface`→transparent fade on the trailing edge.
- Add media as the first row of the Edit sheet: a full-width outlined `accent` button, 44 px, with the "+" icon.

## 4. [M] Inspector and export panel content is cut off with no scroll affordance
**Boards:** `Main_dark/light` (Hold to compare and Apply to all clips are sliced by the inspector bottom edge; Sharpen, Grain and Fade are not reachable), `SCR-Editor_limits_wide_light` (the format summary line `MP4 · 9:16 · …` is half hidden under the footer).
**Why it matters:** Compare and Apply to all are the payoff of the Adjust tab. A half-visible button looks broken, and users don't know the panel scrolls.
**Fix:**
- Make the inspector body a scroll region with a 1 px `line` divider and a sticky footer, `space.3` padding, holding Hold to compare and Apply to all (Adjust) or Cancel and Export (export panel).
- While there is more content, show a 16 px `surface`→transparent fade above the footer.
- Keep the size estimate in the footer row, not in the scrolled content.

## 5. [M] Playhead, trim handles and ruler labels collide
**Boards:** Main_light (the playhead at 0:12.5 merges into the selected clip's right handle, both `#A65305`), every narrow board (the playhead head covers the `0:04` ruler label), `SCR-Editor_default/adding/limits_wide` (the head sits on top of the clip instead of in the ruler), `SCR-Editor_empty_narrow` (the head sits above a floating ruler, at the left edge rather than the centre).
**Why it matters:** The playhead and the trim handles are the most important affordances in the timeline. When they share colour and position, users grab the wrong one, and they can't read the time under the head.
**Fix:**
- Draw the playhead head (10 px) inside the ruler band, always above the clips and handles in z-order.
- Playhead line: 2 px `playhead` with a 1 px `bg` casing on each side, so it separates from `handle` in both themes.
- Ruler labels skip ±16 px around the head.
- Trim handles: `size.handle` 10 px wide with a 2 px `onAccent` grip line, so they read as handles rather than a thicker border.
- In the empty narrow state, keep the head centre-fixed (RULE-14) and start the lanes at the centre.

## 6. [M] The cross-fade marker reads as "delete"
**Boards:** every screen with clips. The round "×" chip sits on each clip join (Main, default/selected/limits wide, compact). CMP-Timeline draws a bowtie instead.
**Why it matters:** The "×" is the universal close/remove symbol. Users will either avoid it or click it expecting to delete the cut.
**Fix:**
- Use the CMP-Timeline bowtie glyph (`size.icon.sm`) in a 20 px chip (`surface`, `lineStrong` border, `radius.xs`), only on joins that have a cross-fade.
- Joins without one show the "+" add affordance on hover or selection only. On touch, use a `size.handleHit` area.

## 7. [M] Icon-only actions are ambiguous
**Boards:**
- Timeline toolbar: `[→` / `→]` (Start here / End here) next to `←` / `→` (Move earlier / later) in CMP-Timeline and FLOW-02/04/06/07, and as seven bare icons in the CMP-Timeline narrow cell.
- MediaPanel "place again" uses `↰`, which reads as Undo next to the trash icon. FLOW-02 uses "+" for the same action.
**Why it matters:** These are four arrows in a row, and two of them change the edit destructively. Users will guess.
**Fix:**
- Wide: text-and-icon buttons for Start here, End here, Earlier and Later (`font.size.sm`, quiet, `surface2` on hover), separated from Split, Delete and Duplicate by a `line` divider. Compact may drop the labels, but must keep tooltips with the shortcut key.
- Narrow: these live in the Edit sheet as labelled 44 px rows (D-038).
- MediaPanel: use a labelled "Add to timeline" text button, or a "+ timeline" icon. Never the undo glyph.

## 8. [M] Notices: three placements, two colour treatments, and they cover the work
**Boards:**
- Placement: `SCR-Editor_limits_wide_dark` (two notices stacked top-left, overlapping the 9:16 frame by about 12 px), `SCR-Editor_adding_wide` (top-left), FLOW-02 (top-centre), CMP-Notice placement cells (bottom of preview), `SCR-Editor_adding_narrow` (covers the text and audio lanes).
- Colour: the slow-device notice is neutral info in CMP-Notice, but `warnBg` with `accent2` violet text and border in CMP-Preview and `limits_wide_light`.
- Body text: the refused-files error renders its whole list in `danger`.
- Progress notice: "Adding 2 of 5…" with a text Cancel in CMP, versus "Checking 2 of 5 files…" with a filename and an outlined Cancel in the screens.
**Why it matters:** Notices land on the video (the hero) or on the timeline the user is about to touch. Violet in a notice clashes with "violet = focus". A long red paragraph is tiring to read.
**Fix:**
- One placement. Wide: bottom-centre of the preview area, max-width `size.popover` (360), `space.3` above the transport, stacking upward with a `space.2` gap. Narrow: an overlay at the bottom of the preview, never over the timeline.
- One recipe:
  - info and success: `surface`, `lineStrong` border, icon in `muted` or `success`
  - warning: `warnBg`, `fg` text, `accent` icon
  - error: `dangerBg`, title in `danger`, list items in `fg` with the filename in `font.weight.semibold`
- No `accent2` in notices.
- One progress layout for screens and CMP.

## 9. [M] The same component is drawn differently on different boards
**Boards and differences:**
- **ExportPanel:** CMP uses underline tabs, segmented controls, size chips and an outlined Export. `limits_wide_light` uses chip tabs, radio rows ("Quality" radio duplicates the QUALITY heading) and a filled Export, so there are two filled buttons on screen at once.
- **ExportProgress:** a compact card in CMP, a modal with a different layout in `exporting_wide`.
- **Font picker:** a segmented row (CMP-Inspector), a 2 × 2 "Aa" tile grid (`editing-text_wide`), wrapping chips (FLOW-06).
- **TextEditor Done:** a pill above the frame with a counter (CMP), an outlined button below the frame with an Esc hint (screens), a button above the frame (FLOW-06). The narrow toolbar also differs between CMP and screen.
- **MusicPicker:** per-row "Add at playhead" (CMP), a single footer button with durations on the right (FLOW-07).
- **LookGallery:** category tabs and an "×" None tile (CMP), a flat row with an empty None square (`selected_narrow`).
- **Selected chip:** `selection` fill with `fg` text and an `accent` border (screens), `accent` text (FLOW, CMP Speed), or fill with no border (CMP Text style).
- **Inspector header:** a plain title "Frame" (screens), a single underlined tab "Frame", "Text" or "Sound" (FLOW-02/07, CMP-Inspector).
- **Aspect order:** Original last (screens), Original first (FLOW-02).
- **Adjust panel:** grouped Light / Colour / Effects starting with Brightness, with no reset (screens), versus a single group in RULE-08 order starting with Temperature, with per-row reset and number fields (CMP).
**Why it matters:** Developers will build one of each, so users will see whichever variant got built. Reviewers can't sign off on the boards as they are.
**Fix:**
- Make the CMP board the source of truth and redraw screens and FLOW from it. Ones to standardise:
  - Selected chip: `selection` fill, 1 px `accent` border, `fg` text, `radius.sm`, 32 px tall (`size.toolButton`) on desktop and 44 px on touch.
  - Single-section inspector header: a plain title row (`font.size.md` semibold), not a lone tab.
  - Export panel: one design, with an outlined `accent` Export (principle 2). While the panel is open, the toolbar Export shows as pressed (`surface2` + `accent` border), so it never sits next to a second filled button.
  - Adjust panel: the CMP version (RULE-08 order, number fields, per-row reset).

## 10. [M] Clip and lane labels overflow, vanish or sit under the waveform
**Boards:**
- `limits_wide_dark`: "trip.mov · 0:10" wraps onto two lines and spills out of the clip.
- FLOW-02/04/06/07: "picni", "sunset.mp4 · 0:" and "Đà Lạ" are hard-cut.
- CMP-Timeline: "sunset · 0:0" is cut, and the left trim handle overlaps the label.
- Narrow boards: main-track clips have no name or duration, and lanes have no kind icons (principle 4).
- `playing_narrow`: the text label shows "êm", and the audio title is gone.
- Narrow: "Morning Walk · CC0" is drawn over the waveform bars.
- Ruler, clip and status labels are 10.5 to 11 px mono (`font.size.ruler`, `font.size.2xs`), below `font.size.xs`, the minimum set by principle 6.
**Fix:**
- Labels stay on one line. The name truncates with an ellipsis, and the duration is kept as the last thing to drop.
- Hide the label when the clip is under 48 px wide and show it in a tooltip on hover or selection.
- Labels stick to the visible left edge of the clip, `space.1_5` inside the handle.
- The audio title sits on a `trackAudio` chip, and the waveform starts after it.
- Narrow: a 20 px lane gutter with the kind icon (`size.icon.sm`, `muted`).
- Raise ruler and clip labels to `font.size.xs` mono, and retire the `2xs` and `ruler` tokens, or document them as non-text.

## 11. [M] Disabled states are unreadable, or read as "brand"
**Boards:**
- `SCR-Editor_empty_narrow` and `empty_wide`: Export is drawn as faded mango, white on peach in light (about 1.6:1), dark on brown in dark.
- `limits_wide_light`: the panel Export, and the disabled Smaller file / Balanced / Best segments, are near-invisible.
- `exporting_wide`: the whole UI is dimmed with no clear "busy" signal on Export.
**Why it matters:** Users still need to read a disabled control's label to learn what will become available. Faded accent also looks like "loading" or a hover state.
**Fix:**
- Disabled filled button: `surface2` fill, `muted` label, 1 px `line` border, no accent.
- Disabled segments: `muted` text, keeping the `line` boundary.
- Next to a disabled Export, show the reason in `font.size.xs` `muted` (the CMP-ExportPanel "needs clip" pattern).
- During export, the toolbar Export shows a 2 px `accent` progress underline instead of dimming.

## 12. [m] Sliders are heavy, and changed values don't stand out
**Boards:** Main_dark/light, `selected_compact`, CMP-Inspector, CMP-LookGallery.
**Issue:**
- Thumbs are about 18 px solid `fg` discs (white in dark, near-black in light) on a 2 px track. Twelve of them stacked read as a dotted column.
- The bipolar fill from centre is a 4 px sliver, so "+24" and "0" look almost the same.
- Light-theme black thumbs are the heaviest marks on the screen.
**Fix:**
- Thumb 14 px: `surface` fill with a 1.5 px `lineStrong` ring at the default value, and an `accent` ring when changed.
- Track 4 px in `line`. The fill from centre (bipolar) or from start in `accent`, with a 1 px `lineStrong` centre tick.
- The value turns `fg` when changed and `muted` at the default.
- Row height `size.control` 28 on desktop, and a 44 px row on touch.

## 13. [m] Density: repeated accents and doubled tab rows ("light, not heavy")
**Boards:**
- CMP-MusicPicker: eight outlined-`accent` "Add at playhead" buttons in one list.
- CMP-LookGallery: two stacked underline tab rows (inspector tabs, then Natural / Film / Cinematic / Black & White) styled the same.
- Speed chips wrap with "4×" orphaned.
- Background swatches wrap 8 + 2 + Blur, and "Original" wraps alone.
- `exporting_wide` meta line mixes mono and sans in one run.
**Fix:**
- MusicPicker: Add is a quiet icon button (`muted`, `surface2` on hover), shown as an `accent` text-and-icon button only on the hovered, focused or previewing row.
- LookGallery categories: a pill segmented control (`surface2` track, `font.size.xs`, 28 px), not a second underline row.
- Even grids: speed as 6 equal segments; swatches 5 + 5 with Blur as a separate chip; aspect as 5 equal segments.
- Meta line: mono for numbers only.

## 14. [M] Timeline proportions and spacing don't match the data
**Boards:** default, selected, adding and Main wide.
**Issues:**
- Clip widths contradict their labels. sunset 0:18 is drawn as about 13 s, picnic 0:03 as about 8 s, street 0:37 as about 15 s, and content ends at about 0:37 while the total says 0:58.
- The wide timeline has about 48 px of dead space under the audio lane, and the preview's 9:16 frame is only about 300 px tall.
- `playing_narrow` and `empty_narrow` float the ruler about 100 px below the transport.
- Empty lanes are bare dashed boxes with no hint.
**Why it matters:** Developers copy board proportions. Wrong widths will produce a timeline whose scale nobody can trust. Dead space is taken from the hero preview.
**Fix:**
- Draw clips at duration × px/s for the ruler shown.
- Pin the ruler directly under the timeline toolbar (wide) or the transport (narrow), with lanes top-aligned and `space.1` between them.
- Size the wide timeline to its content: toolbar 40 + ruler 24 + `timelineTrack` 56 + `timelineLane` 24 + `audioLane` 28 + `space.2` padding ≈ 190 px, and give the rest to the preview.
- Empty main lane: a `muted` `font.size.xs` hint "Drop media here", centred.

## 15. [M] Vietnamese does not fit the fixed-width tab rows
**Boards:**
- `SCR-Editor_selected_narrow_vi` at 390: tab labels "Chỉnh sửa / Âm thanh / Chữ / Bộ lọc màu / Chỉnh màu" fill all 78 px slots with no padding. At 320 the slot is 64 px, and "Bộ lọc màu" cannot fit (that board is clipped, so re-render it at exactly 320 px).
- Wide inspector, 5 tabs in `size.inspector` 288 px: already edge-to-edge in English. vi ("Vị trí, Chỉnh màu, Bộ lọc, Tốc độ, Âm thanh") would overflow, and no vi wide board exists.
- CMP-ExportPanel: "Audio only" already wraps onto two lines in English at popover width.
**Fix:**
- Tab labels use the short copy (COPY-looks.title "Bộ lọc", and similar for the others), `font.size.xs`, one line, ellipsis as the last resort, with a minimum `space.1` side padding.
- The inspector tab row scrolls horizontally with a trailing fade, and the active tab scrolls into view.
- Export format tabs: label "Audio", or let the tabs hug their content, `space.3` apart.
- Add vi cells for the wide inspector and the export panel.

---

## Keep these patterns and use them everywhere
- **Violet focus vs mango selection.** In CMP-LookGallery, the focused tile (Retro, `focus`) and the selected tile (Warm, `accent` + check) sit side by side and can't be confused. CMP-ConfirmDialog and CMP-MusicPicker apply the same rule.
- **"Showing original" pill** (CMP-Preview, holding compare): quiet, on `chrome`, in the corner. Use it for every temporary preview mode.
- **Disabled options with a reason:** struck-through 1440 / 2160 plus a one-line `muted` reason (CMP-ExportPanel). Use this for every unavailable choice.
- **The narrow export sheet** (`exporting_narrow`): a bottom sheet with a grabber and a full-width 44 px Cancel. Use it as the model for all narrow sheets.
- **The narrow editing-text top bar** (`editing-text_narrow`): it collapses to Undo / Redo / Done above the keyboard, and the preview shrinks to fit.
- **Wide regions separated by hairlines only** (`line`), with no cards or shadows. The chrome stays thin, and the video area is the darkest surface.
