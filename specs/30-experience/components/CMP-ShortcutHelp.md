---
id: CMP-ShortcutHelp
title: Shortcut help
status: ready
tokens: [border.width.focus, border.width.hairline, color.dark.accent, color.dark.danger, color.dark.fg, color.dark.focus, color.dark.line, color.dark.lineStrong, color.dark.muted, color.dark.onAccent, color.dark.scrim, color.dark.surface, color.dark.surface2, color.light.accent, color.light.danger, color.light.fg, color.light.focus, color.light.line, color.light.lineStrong, color.light.muted, color.light.onAccent, color.light.scrim, color.light.surface, color.light.surface2, font.family.body, font.family.mono, font.size.2xs, font.size.md, font.size.sm, font.size.xs, radius.md, radius.pill, radius.sm, size.icon.md, size.icon.sm, size.targetMin, size.touchTarget, space.0_5, space.1, space.1_5, space.2, space.3, space.4]
---

## Purpose
Lists the keyboard map (RULE-20).

## Anatomy
Title (COPY-help.title); close; grouped key list; scope note (COPY-help.scope).

## Variants & states
| Variant / state | Description |
|---|---|
| wide dialog · mac | Dialog titled COPY-help.title with close; RULE-20 grouped as COPY-help.group_playback, COPY-help.group_history and COPY-help.group_files (first column), COPY-help.group_edit (second), COPY-help.group_view and COPY-help.group_help (third). Each row is a description followed by its key caps, which wrap inside a right-aligned key column; Mod is shown as the Command key and Alt as Option. Footer COPY-help.scope. Shown in both themes. |
| other systems | The same rows with Mod shown as Ctrl and Alt as Alt (History and the Move row shown in both themes); key caps wrap so the widest row fits its column. |
| narrow sheet | Bottom sheet, at most the D-038 sheet height, with a grab handle, header with a touch-size close, and a single scrolling column of the same groups with a fade at the cut. |

## Behavior
- Opens with ? or COPY-action.shortcuts (F-017.AC4; on narrow widths from the More menu) and lists RULE-20 in the active language; key names stay as on the keyboard.
- Rows: COPY-help.play_pause, COPY-help.frame_step, COPY-help.go_ends; COPY-action.split, COPY-action.set_in, COPY-action.set_out, COPY-action.delete, COPY-action.duplicate, COPY-help.move, COPY-help.mute, COPY-action.add_text, COPY-action.copy_look, COPY-help.paste, COPY-action.compare (with COPY-help.hold); COPY-action.undo, COPY-action.redo; COPY-help.zoom, COPY-action.zoom_fit, COPY-help.snapping; COPY-action.add_media, COPY-action.export; COPY-action.shortcuts, COPY-help.esc, COPY-help.finish_editing.
- The Mod key label follows the platform: the Command key on mac, Ctrl elsewhere.
- Esc or close dismisses it; while open, only Esc acts (RULE-20).

## Accessibility
- Modal dialog named by COPY-help.title; focus moves to the close button and returns to the opener.
- Each group is a heading followed by a description list (description, then keys), so screen readers read the action before the keys.
- The list scrolls inside the dialog; the close control meets RULE-21 targets on coarse pointers.
