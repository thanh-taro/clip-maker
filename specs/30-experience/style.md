---
title: Style — Mango on night
status: ready
---

# Style — "Mango on night" (decision D-031)

Clip Maker shares the portal and its sibling tools' base: the violet-black neutrals, Manrope and
JetBrains Mono, spacing, radii and motion. Mango, the Media category's colour, is the tool's one
strong colour. The video is the hero and the chrome stays thin. All values live in `tokens.json`;
components hard-code no colours, sizes or fonts. Dark is the default look for editing video, and
light is fully supported (D-029).

## Principles
1. **Video first.** The preview sits on `workArea`, the darkest surface. Regions are separated by
   hairlines (`line`), with no cards, shadows or glow. Floating sheets, menus and dialogs sit on
   `surface` with a `lineStrong` border.
2. **One filled button.** Export is the only filled control (`accent` / `onAccent`). Every other
   action is a quiet icon or text-and-icon button that fills with `surface2` on hover. Dialog
   primary actions are outlined (`accent`, or `danger` when they discard work).
3. **Mango means "this, now".** The playhead, the selected timeline item and its trim handles
   (`handle`), slider fills, the active tab and the chosen look use `accent`. Keyboard focus and
   placement outlines over video use the suite violet (`focus`, `previewOutline`), so focus never
   looks like selection.
4. **Tracks by kind, never by colour alone.** Main-track clips alternate between `trackClip` and
   `trackClipAlt` and show a thumbnail strip with the duration. Text layers (`trackText`) show
   their text. Audio clips (`trackAudio`) show a `waveform` and the track title. Each lane also
   carries an icon.
5. **Numbers in mono.** Times (mm:ss:ff), durations, adjustment values, sizes and estimates use
   JetBrains Mono with tabular digits, so they don't jump while you drag.
6. **Dense but targetable.** Desktop controls are `size.control` / 32 px. On a coarse pointer every
   target is at least `size.touchTarget` (44 px), and handles get a `size.handleHit` hit area.
   Text never goes below `font.size.2xs`.
7. **Same quality in both themes.** Every pair in `contrast.pairs` passes WCAG AA
   (`tools/token_contrast.py`). The colours inside the video (text palette `text.color.*`) never
   change with the theme (INV-05).

## Type
- **UI:** Manrope 500/600 at `font.size.sm`–`md`. Section headings in the inspector are
  `font.size.xs` uppercase `muted`, letter-spaced.
- **Numbers:** JetBrains Mono at `font.size.sm`. Number fields use `font.size.input` so phones
  don't zoom on focus.
- **Text layers in the video:** the four RULE-11 faces (Sans, Display, Serif, Rounded), chosen in
  `40-technical`, at sizes from RULE-11, not from the UI scale.
- The portal's display face (Unbounded) is not used inside the tool.

## Layouts
Breakpoints are measured on the tool's own width (the iframe when embedded):
- **Wide (≥ 1000 px):**
  - toolbar on top;
  - preview centre-left, with play controls under it;
  - inspector docked right (`size.inspector`), with tabs Frame/Edit, Adjust, Looks, Text, Sound;
  - timeline across the bottom (main track, text lane, audio lane);
  - status bar.
  The media panel opens as a left drawer from Add media.
- **Compact (700–999 px):** the inspector becomes a resizable right sheet, toolbar labels become
  icons, and the timeline stays at the bottom.
- **Narrow (< 700 px, phones):** (D-038)
  - **Top bar:** More menu (New project, Keyboard shortcuts, Licences and credits, Source code), then Undo and Redo, then Export (filled). Every target is at least 44 px.
  - **Preview**, then the **timeline** with the centre-fixed playhead (RULE-14, D-013).
  - **Bottom tab bar** (`size.tabBar`): Edit, Audio, Text, Looks, Adjust.
    - *Edit* holds Add media, Frame (when nothing is selected), and the selection's actions: split, start/end here, delete, duplicate, move earlier/later, cross-fade, speed, fades, position and nudge.
    - *Audio* holds Music (CMP-MusicPicker), add your own audio, and the selection's sound.
    - *Text* holds Add text and the text style.
    - *Adjust* holds the 12 adjustments, Hold to compare, Apply to all, and copy/paste colour.
    Each tab opens its tools as a bottom sheet above the tab bar. The transport (44 px) and a timeline peek (ruler + main track, 76 px) always stay visible above an open sheet; no sheet is open by default. A sheet takes at most 40 % of the height (60 % when the tool is under 640 px tall). Its body scrolls, including any message above a sticky footer, and the export panel follows the same rule.
  - **A one-line status row** under the tab bar: the privacy badge text (F-020.AC1) and the source link as an icon.
  - **Timeline zoom:** pinch, plus zoom controls in the timeline's corner.

## Time, playhead and handles (D-039)
- Durations and totals read m:ss, as in 0:58. Frames appear only as a muted suffix to the current time in the transport, or when the timeline is zoomed to frames.
- **Playhead:** a 2 px `playhead` line with a 1 px `bg` casing. Its head sits inside the ruler band and never covers ruler labels.
- **Trim handles:** neutral `handle`-coloured end tabs (fg-like, never mango) with a `bg` grip mark, drawn only on the selected item. They are visually distinct from the playhead.
- **Cross-fade marker:** a bow-tie glyph between clips, never an ×.
- **Inspector body:** scrolls, with a sticky footer for whole-clip actions (Hold to compare, Apply to all, copy/paste colour) and a fade at the cut.
- **Notices:** one placement: bottom-centre of the preview area above the timeline, or on phones above the transport. At most 2 show at once, plus a "+N more" chip (COPY-notice.more). Error lists show at most 3 items plus COPY-action.show_all. A length-limited result is info (`accent` icon), not a warning. Error dialogs are titled with the outcome (COPY-export.failed_title, COPY-export.interrupted_title, COPY-export.no_space_title), in `danger`. Each severity has one recipe: success uses `success` for the icon; error uses `danger` for the icon and title, with `fg` text for lists; progress uses `accent`. Violet (`focus`) is never used for notice text.
- **Icon buttons:** where arrows could be confused (move earlier/later, place again), use text-and-icon buttons.

## Motion
`motion.duration.fast` for hover and press, `base` for sheets and panels, `slow` for full-screen
transitions. Playback, scrubbing and the playhead are never animated by the UI. With reduced
motion, sheets appear without sliding.
