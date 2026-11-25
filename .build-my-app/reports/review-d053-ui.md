# D-053 colour-tool UI review (F-024..F-027, CMP-ColourPicker)

Reviewed: `.build-my-app/reports/screens/F-024..F-027/*.png` against F-007 Adjust screens, `specs/30-experience/style.md`, `tokens.json`, CMP-Inspector, CMP-ColourPicker, RULE-24. Static screenshots only; hit areas inferred from drawn size.

## Major

1. **Narrow picker shows about one row: not acceptable** (builder flag 3). `F-027/sheet-duotone-picker-narrow-en-US.png`, `-vi-VN.png`. At 320x640 the sheet is 40 % (256 px). After the grabber, title/Done row, fixed swatch+hex part and the 60 px footer, about 44 px is left to scroll. The Hue slider shows without its label, the `221` field is clipped top and bottom, and the presets are scrolled out of view. A scroll area inside a draggable sheet that is one row tall is hard to use, and the user can't see a label and its control together. Fix (spec change to CMP-ColourPicker "narrow" and style.md sheet height):
   - (a) While the picker is open, raise the sheet to 60 % of the height, the cap style.md already uses below 640 px.
   - (b) Hide the Adjust footer while the picker is open. Done is the way back and the preview updates live.
   - (c) Put slider labels to the left at touch size (as in F-007 rows) instead of above them. This saves about 20 px per row.
   - (d) Merge the before/after pair and the hex field into one 44 px row.
   - Budget: grabber 16 + title 44 + swatch/hex 44 + presets 44 + 3 x 44 sliders + space.3 gaps ≈ 330 px, which fits in 384 px with no inner scroll.
2. **The picker doesn't say which colour it edits.** All four picker shots are titled only "Choose a colour" / "Chọn màu". On narrow the picker replaces the sheet body. On wide the colour button has scrolled off above the popover. With Shadows and Highlights side by side, users can't tell which one they are changing. Fix: show the opener's label as the title or as a subtitle line ("Shadows colour"), using `font.size.sm` and `muted`. This needs a copy key such as `COPY-picker.title_for` = "{name}" (spec change).
3. **Group titles, field labels and section headings look the same.** `F-024/inspector-mixer-wide-*.png`, `F-025/inspector-pop-wide-*.png`, `F-027/inspector-duotone-wide-*.png`. "COLOUR MIXER" (a disclosure button), "COLOUR RANGE" / "KEEP COLOUR" / "COLOUR PAIRS" (field labels) and LIGHT/COLOUR/EFFECTS all use muted caps. Split toning's sub-headings "Shadows" and "Highlights" use sentence case in `fg`. Three levels look like one, and the clickable title looks like static text. Fix:
   - Colour-tool group titles: sentence case, `font.weight.semibold`, `font.size.md`, `fg`, with the chevron. This sets them apart as interactive and makes them shorter (see 5).
   - In-group field labels (Colour range, Keep colour, Colour pairs, Hex code, Preset colours): sentence case `font.size.sm` `fg`, like the Hue/Strength row labels.
   - Keep muted caps only for LIGHT/COLOUR/EFFECTS.
4. **Hover and inactive tints look like the selected or unavailable state on touch.** `F-024/sheet-mixer-narrow-*.png` (mixer header filled), `F-027/sheet-duotone-narrow-en-US.png` ("Midnight & Peach" tinted while Custom is chosen), `F-025/sheet-pop-narrow-*.png` (unselected "Off" tinted). They use the same lavender `surface2` fill as the unavailable "Apply to all clips". On a phone this reads as "this pair is chosen" or "this is disabled". Fix:
   - Put all hover styling under `@media (hover: hover)`.
   - Unselected tiles: `surface` with a `lineStrong` hairline.
   - Selected: `selection` with an `accent` border (as the Custom tile on wide). Use no other fill.

## Minor

5. **vi-VN group header wraps on wide.** `F-026/inspector-split-wide-vi-VN.png`: "TÁCH TÔNG / MÀU" breaks onto two lines and moves the marker and Reset out of line. The inspector content (~264 px) is narrower than the phone sheet. Fix:
   - Apply finding 3's sentence-case title (no `letterSpacing.caps`).
   - Title `flex:1; min-width:0`.
   - Marker and Reset `white-space:nowrap`; header gap `space.2`.
6. **Changed dot on range swatches is hard to see.** `F-024/inspector-mixer-wide-en-US.png`: the about 5 px accent dot sits on the swatch rim and is almost lost on Blue. Fix: 6 px dot (`space.1_5`), placed outside the swatch's top-right corner, with a 2 px `bg` ring (`space.0_5`).
7. **Colour pop "Off" and duotone "Off" look different.** Pop uses a small pill on its own row (`F-025/inspector-pop-wide-en-US.png`). Duotone uses a full tile (`F-027/inspector-duotone-wide-en-US.png`). Spec: "None, then the eight ranges (same layout)". Fix: one shared None tile style (height `size.control` on wide, `size.touchTarget` on narrow; selected style as in finding 4), in the same radio group. On narrow it can take its own row as a full-width tile.
8. **Range swatches always 2x4 on phones** (builder flag 2). Two rows of four is correct at 320 px: eight 44 px targets need 380 px. Fix: a container query that switches to one row of eight when the content is at least 380 px wide (8 x `size.touchTarget` + 7 x `space.1`), which means a sheet of about 404 px or more. Below that, keep 2x4. Low impact.
9. **Hue sliders are too short on phones.** `F-026/sheet-split-narrow-*.png`: the hue track is about 80 px for 360°, about 4.5° per px. Fix: on narrow colour-tool hue rows, put the label above the slider (full width, about 270 px). Or shorten the label column to `size.field`, since the field already shows the value.
10. **Before/after swatches have no labels and look identical when nothing has changed.** Both picker shots show two equal squares, each labelled with the same hex. Fix: one split swatch (left = when opened, right = now) with small `muted` labels, using `font.size.xs` and new copy keys `COPY-picker.before` / `COPY-picker.now` (spec change).
11. **Preset row wraps 6 + 4 on the wide picker.** `F-027/inspector-duotone-picker-wide-*.png`. Fix: lay out a 5 x 2 grid with `space.2` gaps so the rows are even.
12. **Duotone Reset hidden while Off** (builder flag 1). Keep it hidden. "Changed" and Reset should mean "this tool changes the picture". Showing Reset on an Off tool that looks unchanged would confuse more than it helps. The remembered colours come back as soon as Custom is chosen, and Reset clears them in one tap from there. Two requirements:
    - Use the same rule for colour pop's None, which keeps Range and Amount.
    - Make the marker and Reset use the same rule.
    - Spec change: CMP-Inspector says "while any of its values differs from default". Change it to "while the tool is on and differs from default", and note that Reset all still forgets the remembered colours.

## Keep
- The mixer hue track runs from the previous range's colour to the next one's, and the picker's saturation and lightness tracks are drawn in their colours.
- The chosen-range name at the right of the label row (colour is never the only cue).
- Row rhythm and the label/slider/field/reset columns match F-007 exactly on both layouts.
- The group Reset uses the same text-plus-icon accent style as "Reset all".
