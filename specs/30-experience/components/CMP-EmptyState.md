---
id: CMP-EmptyState
title: Empty state
status: ready
tokens: [border.width.focus, border.width.hairline, color.dark.accent, color.dark.bg, color.dark.danger, color.dark.fg, color.dark.focus, color.dark.line, color.dark.lineStrong, color.dark.muted, color.dark.onAccent, color.dark.success, color.dark.surface, color.dark.surface2, color.dark.workArea, color.light.accent, color.light.bg, color.light.danger, color.light.fg, color.light.focus, color.light.line, color.light.lineStrong, color.light.muted, color.light.onAccent, color.light.success, color.light.surface, color.light.surface2, color.light.workArea, font.family.body, font.family.mono, font.size.2xs, font.size.lg, font.size.md, font.size.sm, font.size.xs, radius.device, radius.md, radius.pill, radius.sm, size.icon.md, size.icon.sm, size.statusbar, size.tabBar, size.toolButton, size.touchTarget, space.0_5, space.1, space.1_5, space.2, space.3, space.4, space.6]
---

## Purpose
Invites the user to add media when the project is empty.

## Anatomy
Title (COPY-empty.title); add media action; drop hint; privacy reminder.

## Variants & states
| Variant / state | Description |
|---|---|
| default · wide | Fills the preview area: video, photo and music icons, COPY-empty.title, an outlined COPY-action.add_media, COPY-empty.drop_hint and the privacy reminder COPY-privacy.badge with a shield icon, inside a dashed drop zone. |
| add media focused · wide | Keyboard focus on COPY-action.add_media shows the focus ring outside the button. |
| default · narrow | The same content between the narrow top bar (COPY-action.more, then COPY-action.undo and COPY-action.redo disabled, then a disabled but readable COPY-action.export) and the tab bar and status row (D-038); COPY-action.add_media is a touch-size button. |

## Behavior
- Shown whenever the project has no clips, text or audio (SCR-Editor empty); the timeline and export are unavailable meanwhile, and the disabled Export keeps a readable label.
- COPY-action.add_media opens the system file picker for video, photo and audio (F-001.R1); Mod+O does the same (RULE-20).
- Dropping files anywhere on the tool shows CMP-DropOverlay; pasting files adds them (F-001.R1).
- After the first file is accepted the empty state is replaced by the preview; an audio-only project keeps the preview area but export stays unavailable with COPY-notice.needs_clip (F-001.AC11).

## Accessibility
- COPY-empty.title is a heading; COPY-action.add_media is the first focusable control in the region and receives focus when the host moves focus into the tool (RULE-17).
- Icons are decorative; the privacy reminder is plain text.
- Touch target per RULE-21 on coarse pointers (NFR-06); the focus ring meets 3:1 against the work area.
