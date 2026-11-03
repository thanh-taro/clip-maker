---
id: CMP-ExportPanel
title: Export panel
status: ready
tokens: [border.width.focus, border.width.hairline, color.dark.accent, color.dark.bg, color.dark.danger, color.dark.fg, color.dark.focus, color.dark.line, color.dark.lineStrong, color.dark.muted, color.dark.onAccent, color.dark.selection, color.dark.surface, color.dark.surface2, color.dark.warnBg, color.light.accent, color.light.bg, color.light.danger, color.light.fg, color.light.focus, color.light.line, color.light.lineStrong, color.light.muted, color.light.onAccent, color.light.selection, color.light.surface, color.light.surface2, color.light.warnBg, font.family.body, font.family.mono, font.size.2xs, font.size.input, font.size.md, font.size.sm, font.size.xs, font.size.xsPlus, motion.duration.base, motion.duration.fast, radius.md, radius.pill, radius.sm, size.control, size.icon.md, size.icon.sm, size.inspector, size.tab, size.targetMin, size.toolButton, size.touchTarget, space.0_5, space.1, space.1_5, space.2, space.2_5, space.3, space.3_5, space.4]
---

## Purpose
Choose what to export and how.

## Anatomy
Header (COPY-export.title); kind tabs (COPY-export.kind_video, COPY-export.kind_gif, COPY-export.kind_audio); a scrolling body with the settings of the chosen kind; a sticky footer with the size estimate (COPY-export.estimate), the format line (COPY-export.saves_as or COPY-export.format_note), COPY-action.cancel and COPY-action.export.

## Variants & states
| Variant / state | Description |
|---|---|
| video · wide | Docked in the inspector column, at the inspector width, replacing the inspector content while open (SCR-Editor exporting-setup). Header COPY-export.title with an icon-only COPY-action.close; kind tabs sized to their labels and aligned to the start; body (scrolls, with a fade above the footer): COPY-export.resolution (480, 720, 1080, 1440, 2160; RULE-15 default chosen), COPY-export.quality (COPY-export.q_smaller, COPY-export.q_balanced default, COPY-export.q_best) and COPY-export.size_limit (COPY-export.size_target quick choices 8, 10, 25, 50 and the whole-number field COPY-export.size_custom). Sticky footer: estimate in mono, COPY-export.saves_as, a quiet COPY-action.cancel and an outlined COPY-action.export. |
| resolution unavailable | A size that isn't offered is disabled and struck through, and its reason is always shown under the row: COPY-export.res_needs_source or COPY-export.res_no_encoder. |
| lower res | Size target too small for the chosen resolution: the custom field shows the accent selection, a warning box (warning icon, warning background, normal text) with COPY-export.target_lower_res follows it, and COPY-action.use_res is offered (in the body on wide, in the footer on narrow). Export stays disabled until the target can be met. |
| fallback | COPY-export.format_note replaces COPY-export.saves_as in the footer (RULE-15, F-023.R3). |
| needs clip | Footer shows COPY-notice.needs_clip beside a disabled Export, for every kind (RULE-03). |
| gif | COPY-export.gif_range with two time fields COPY-export.gif_from and COPY-export.gif_to in m:ss (frames optional), defaulting per RULE-16; COPY-export.gif_size 320, 480 (default) or 640; COPY-export.gif_rate 10 or 15 (default); estimate, COPY-export.saves_as and Export in the footer. |
| audio | COPY-export.audio_format with COPY-export.audio_compressed (default; names the format the device can encode) and COPY-export.audio_wav; estimate and Export. |
| no sound | On the Audio only kind, the footer shows COPY-notice.no_sound_to_export beside a disabled Export (RULE-16); the format choices stay visible. |
| narrow | Bottom sheet docked above the tab bar, under the transport and the timeline peek (SCR-Editor exporting-setup narrow). Its height is capped at 40 % of the viewport height, or 60 % when the viewport is under 640 px tall. Top to bottom: grab handle; header with COPY-export.title and an icon-only COPY-action.close (Close replaces Cancel in the sheet); the kinds as a full-width touch-size segmented row; the scrolling body; the sticky footer. The body scrolls with a fade at each cut edge; every message (COPY-export.target_lower_res, COPY-export.target_unreachable, the disabled-size reasons) sits at the end of the body and scrolls with it, so the footer stays one row. Size-target choices are equal touch-size segments, the custom field is touch size and gets a danger border while its target can't be met. Footer, one row: when export is possible, the estimate in mono and COPY-export.saves_as (or COPY-export.format_note) on the left and an outlined Export on the right; when a target can't be met, an outlined COPY-action.use_res or COPY-action.use_target (flex) and the disabled Export. Drawn in en-US at 390 wide (sheet capped at 40 %) and in vi-VN at the minimum width of 320 with a 568 tall viewport (60 %). |
| opener states | While the panel is open, the toolbar COPY-action.export shows as pressed (raised surface with the accent border) so it never sits next to a second filled button. While an export runs it shows a thin accent progress line and is busy. Drawn on CMP-Toolbar (export panel open; compact exporting). |

## Behavior
- Opens from COPY-action.export or Mod+E (RULE-20); Esc, COPY-action.cancel, COPY-action.close or opening another inspector tab closes it without exporting. Wide: it docks in the inspector column and the preview and timeline stay usable. Narrow: it opens as a sheet; with reduced motion it appears without sliding.
- Exactly one filled button is on screen: the toolbar Export. The panel's own Export is outlined; disabled buttons use the raised surface with a muted label and a hairline border, so their label stays readable.
- Quality levels and size targets are one choice: picking a size target clears the quality level and vice versa (RULE-15). Typing a custom number selects it.
- The estimate and the target messages update as soon as any setting changes; the estimate uses mono digits so it doesn't jump.
- Only sizes and formats the device can encode are enabled (F-015.AC1, F-023.R3); the reason for each disabled size is always visible, not only on hover.
- GIF range: From/To accept m:ss with optional frames; the range is clamped to 15 s and to the project (RULE-16). For projects of 15 s or less both fields are read-only and show the whole project.
- Export starts the export and hands over to CMP-ExportProgress; settings are kept for the session and across new projects (RULE-23).
- When a size target can't be met, the body scrolls the custom field and its message into view above the footer.
- When export isn't possible (needs clip, no sound, unreachable target) the reason is shown beside the disabled Export instead of hiding the panel.

## Accessibility
- The panel is a dialog named by COPY-export.title; focus moves to the selected kind tab on open and returns to COPY-action.export on close.
- Kinds are a tab list; resolution, quality, size target, GIF size and rate, and audio format are radio groups inside fieldsets with visible legends, operable with arrow keys.
- Disabled options stay discoverable as disabled radios described by their reason text; the custom size field has its own accessible name (COPY-export.size_custom_label).
- Warnings (target messages, COPY-notice.needs_clip, COPY-notice.no_sound_to_export) are polite live regions tied to the Export action as its description.
- Every control meets the minimum target size; in the narrow sheet and on a coarse pointer, tabs, options, chips, fields and buttons meet RULE-21 touch targets (NFR-06).
- The keyboard focus ring uses the focus colour and is distinct from the selected-option outline.
