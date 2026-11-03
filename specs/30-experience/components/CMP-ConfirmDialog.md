---
id: CMP-ConfirmDialog
title: Confirm dialog
status: ready
tokens: [border.width.focus, border.width.hairline, color.dark.accent, color.dark.bg, color.dark.danger, color.dark.fg, color.dark.focus, color.dark.line, color.dark.lineStrong, color.dark.muted, color.dark.onAccent, color.dark.scrim, color.dark.surface, color.dark.surface2, color.dark.workArea, color.light.accent, color.light.bg, color.light.danger, color.light.fg, color.light.focus, color.light.line, color.light.lineStrong, color.light.muted, color.light.onAccent, color.light.scrim, color.light.surface, color.light.surface2, color.light.workArea, font.family.body, font.family.mono, font.size.2xs, font.size.base, font.size.md, font.size.sm, font.size.xs, motion.duration.base, radius.device, radius.md, radius.pill, radius.sm, size.icon.md, size.popover, size.touchTarget, space.1, space.1_5, space.2, space.3, space.4, space.5]
---

## Purpose
Asks before an action that loses work.

## Anatomy
Message; confirm; cancel.

## Variants & states
| Variant / state | Description |
|---|---|
| default · wide | Centred dialog over a scrim, at most the popover width, with COPY-confirm.new_project, a quiet COPY-action.cancel and a danger-outlined COPY-action.new_project. Initial focus is on Cancel. |
| focus on confirm · wide | Keyboard focus ring on COPY-action.new_project. |
| narrow | Bottom sheet with a grab handle; full-width touch-size actions stacked, COPY-action.new_project above COPY-action.cancel. |
| default · vi-VN | The wide dialog in vi-VN, to check length. |

## Behavior
- Opens when the user picks COPY-action.new_project (from the toolbar on wide, from the More menu on narrow) with unexported changes (RULE-19, F-018.AC3); without them the new project starts at once (F-018.AC5).
- Cancel, Esc or a click on the scrim close it and change nothing. Confirm starts a new project per RULE-23.
- With reduced motion the dialog appears without scaling or sliding.

## Accessibility
- Alert dialog, modal, named by COPY-action.new_project and described by COPY-confirm.new_project.
- Focus starts on Cancel (the safe choice), is trapped inside, and returns to the opener on close.
- The destructive action is marked by wording and outline, not colour alone; targets meet RULE-21 on coarse pointers (NFR-06).
