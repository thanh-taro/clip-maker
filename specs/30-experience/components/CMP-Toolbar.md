---
id: CMP-Toolbar
title: Toolbar
status: ready
tokens: [font.family.body, font.family.mono, font.weight.medium, font.weight.semibold, border.width.hairline, border.width.focus, motion.duration.fast, color.dark.accent, color.light.accent, color.dark.bg, color.light.bg, color.dark.fg, color.light.fg, color.dark.focus, color.light.focus, color.dark.line, color.light.line, color.dark.lineStrong, color.light.lineStrong, color.dark.muted, color.light.muted, color.dark.onAccent, color.light.onAccent, color.dark.selection, color.light.selection, color.dark.surface, color.light.surface, color.dark.surface2, color.light.surface2, color.dark.workArea, color.light.workArea, space.5, space.3, space.1_5, space.2_5, radius.sm, space.3_5, font.size.xs, space.1, radius.md, font.size.md, font.size.sm, space.2, radius.pill, font.size.input, font.size.lg, space.4, space.0_5, font.size.base, size.toolbar, size.toolButton, size.touchTarget, size.targetMin, size.icon.sm, size.icon.md, motion.duration.base]
---

## Purpose
Top-level actions: add media, music, text, undo and redo, new project, export, help. On phones it is the top bar of D-038.

## Anatomy
Add media (COPY-action.add_media); Music (COPY-action.music); Add text (COPY-action.add_text); Undo (COPY-action.undo) and Redo (COPY-action.redo); Keyboard shortcuts (COPY-action.shortcuts); New project (COPY-action.new_project); Export (COPY-action.export), the only filled button; on narrow layouts a More menu (COPY-action.more) as the first item.

## Variants & states
| Variant / state | Description |
|---|---|
| wide / default | Labelled text-and-icon Add media, Music and Add text; icon-only Undo and Redo; Keyboard shortcuts (icon) and New project (text and icon) at the end, then Export filled. Hover fills a button with the hover surface; keyboard focus shows the violet focus ring, never the mango selection colour. Redo is unavailable after any new edit (F-014). |
| wide / empty project · vi-VN | Undo, Redo and Export unavailable. The unavailable Export keeps a readable label: it drops the accent fill for the raised surface, a muted label and a hairline border, so it never reads as a faded accent. Vietnamese labels fit without truncation. |
| wide / export panel open | Export shows as pressed (raised surface with an accent border, not filled) while CMP-ExportPanel is open, so the panel's own Export is the only filled-looking export on screen. |
| compact / exporting | Every action icon-only except Export; each icon button keeps its accessible name. While an export runs Export stays pressed and carries a thin accent progress underline (COPY-export.progress_label) instead of dimming the toolbar. |
| narrow / default | D-038 top bar: More first (a vertical three-dot icon, the same glyph everywhere), then Undo and Redo, a flexible gap, and Export filled. Every target is touch size, Export included. |
| narrow / More menu open | More is pressed and opens a menu below it with New project, Keyboard shortcuts, a divider, Licences and credits (COPY-privacy.notices) and Source code on GitHub (COPY-privacy.source_label, opens a new tab). Menu rows are touch size. |
| narrow / empty · vi-VN | Undo, Redo and Export unavailable (readable, as on wide); COPY-notice.needs_clip explains why under the bar. |

## Behavior
- Add media opens the file picker (F-001) or, on narrow layouts, the full-width Add media row at the top of the Edit sheet, shown whether or not something is selected; Music opens CMP-MusicPicker; Add text adds a layer at the playhead (F-010).
- Undo and Redo follow RULE-13 and become unavailable when there is nothing to undo or redo (F-014).
- New project asks first through CMP-ConfirmDialog (F-018).
- Export opens CMP-ExportPanel and is unavailable until the project has a video or photo clip; activated from the keyboard while unavailable it shows COPY-notice.needs_clip.
- Below the wide breakpoint labels collapse to icons (compact). On narrow layouts (D-038) New project, Keyboard shortcuts, Licences and credits and Source code move into the More menu; Music moves to the Audio tab and Add text to the Text tab of the bottom tab bar.
- The More menu closes on Esc, on choosing an item, or on a tap outside it, and returns focus to More.

## Accessibility
- The bar is a toolbar named COPY-toolbar.label; arrow keys move between its buttons.
- Icon-only buttons carry their COPY label as the accessible name; unavailable buttons are disabled, not hidden, and stay legible.
- More has a popup indicator and an expanded state; its items are menu items. Export exposes an expanded state while the export panel is open.
- Every target meets RULE-21 on touch (`size.touchTarget`) and `size.targetMin` with a fine pointer; focus uses the focus ring token (NFR-06).

## Copy also used
COPY-action.dismiss, COPY-action.done, COPY-tab.audio, COPY-adjust.group_effects, COPY-action.go_start, COPY-action.go_end, COPY-export.progress_label, COPY-notice.needs_clip
