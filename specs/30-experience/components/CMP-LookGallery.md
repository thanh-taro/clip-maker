---
id: CMP-LookGallery
title: Look gallery
status: ready
tokens: [font.family.body, font.family.mono, font.weight.medium, font.weight.semibold, border.width.hairline, border.width.focus, motion.duration.fast, color.dark.accent, color.light.accent, color.dark.bg, color.light.bg, color.dark.fg, color.light.fg, color.dark.focus, color.light.focus, color.dark.line, color.light.line, color.dark.lineStrong, color.light.lineStrong, color.dark.muted, color.light.muted, color.dark.onAccent, color.light.onAccent, color.dark.selection, color.light.selection, color.dark.surface, color.light.surface, color.dark.surface2, color.light.surface2, space.5, space.3, space.1_5, space.2_5, radius.sm, space.3_5, font.size.xs, space.1, radius.md, font.size.md, font.size.sm, space.2, radius.pill, font.size.input, font.size.lg, space.4, space.0_5, radius.tile, font.size.base, font.size.2xs, size.inspector, size.tab, size.control, size.touchTarget, size.icon.sm]
---

## Purpose
Browse, preview and choose a look and its intensity.

## Anatomy
Group control (COPY-looks.groups); look tiles with live thumbnail and name (the look names listed below); None (COPY-looks.none); Intensity slider and field (COPY-looks.intensity); previewing status (COPY-looks.previewing).

## Variants & states
| Variant / state | Description |
|---|---|
| chosen | Inside the inspector's Looks tab: a pill segmented group control (Natural, Film, Cinematic, Black & White: COPY-looks.group_natural, COPY-looks.group_film, COPY-looks.group_cinematic, COPY-looks.group_bw) whose four pills share the inspector width so every group name shows in full (no clipping, no sideways scroll), not a second underline tab row; a three-column grid of None and the group's four looks, each a thumbnail with its name; the chosen tile has a mango outline, a check badge and a mango name; Intensity slider and field. |
| focus | Keyboard focus on a tile outlines its thumbnail in violet and previews the look; a muted status line COPY-looks.previewing names it. The chosen look (in another group) stays chosen. |
| None | None is chosen (mango outline and check); Intensity is unavailable; the hovered tile is outlined in violet and previewed. |
| drawing | Placeholder thumbnails with a progress icon for tiles not yet drawn; names and choosing stay available. |
| unavailable | A look that could not be loaded: a plain placeholder with its name; choosing it still works and it shows once it loads; no preview. |
| narrow / chosen | Bottom sheet with a grabber: the touch-size pill group control, a single row of None and the four looks, and a touch-size Intensity row. |
| narrow / drawing | Placeholders after the first ready tiles. |
| narrow / vi-VN | Group and look names in Vietnamese (COPY-looks.title reads "Bộ lọc"); every label fits without truncation. Drawn at a 320 width: the sheet keeps `space.3` side insets, and below 360 the tile row shows four columns and scrolls sideways under a trailing fade to reach the fifth look. |

## Behavior
- The group control switches the visible looks; the chosen look stays chosen across groups.
- Pointer hover or keyboard focus previews a look on the selected clip without an undo step; click, tap or Enter chooses it as one undo step (RULE-09); on touch every tap is a choice.
- Intensity runs 0–100, default 100; at 0 the result equals None.
- Thumbnails show the RULE-09 frame with the clip's adjustments and the look at 100.

## Accessibility
- The group control is a tablist named COPY-looks.groups; the tiles form a radio group named COPY-looks.title.
- The chosen state is shown by outline and check mark, not colour alone; previewing is announced as a status.
- Tiles, group pills and Intensity meet RULE-21 on touch; tile names never go below `font.size.2xs`.

## Copy also used
COPY-look.natural_fresh, COPY-look.natural_warm, COPY-look.natural_cool, COPY-look.natural_vivid, COPY-look.film_faded, COPY-look.film_retro, COPY-look.film_pastel, COPY-look.film_instant, COPY-look.cine_teal_orange, COPY-look.cine_moody, COPY-look.cine_night, COPY-look.cine_golden, COPY-look.bw_classic, COPY-look.bw_high, COPY-look.bw_soft, COPY-look.bw_sepia
