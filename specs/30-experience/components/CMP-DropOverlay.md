---
id: CMP-DropOverlay
title: Drop overlay
status: ready
tokens: [border.width.focus, border.width.hairline, color.dark.accent, color.dark.bg, color.dark.danger, color.dark.fg, color.dark.focus, color.dark.line, color.dark.lineStrong, color.dark.muted, color.dark.onAccent, color.dark.scrim, color.dark.success, color.dark.surface, color.dark.surface2, color.dark.trackAudio, color.dark.trackClip, color.dark.trackClipAlt, color.dark.trackText, color.dark.workArea, color.light.accent, color.light.bg, color.light.danger, color.light.fg, color.light.focus, color.light.line, color.light.lineStrong, color.light.muted, color.light.onAccent, color.light.scrim, color.light.success, color.light.surface, color.light.surface2, color.light.trackAudio, color.light.trackClip, color.light.trackClipAlt, color.light.trackText, color.light.workArea, font.family.body, font.family.mono, font.size.2xs, font.size.lg, font.size.md, font.size.sm, font.size.xs, motion.duration.fast, radius.clip, radius.device, radius.md, radius.pill, radius.sm, radius.trackItem, size.audioLane, size.icon.md, size.icon.sm, size.statusbar, size.tabBar, size.timelineLane, size.timelineTrack, size.touchTarget, space.0_5, space.1, space.10, space.1_5, space.2, space.3, space.4, space.5, space.6, space.8]
---

## Purpose
Shows that dropping files will add them.

## Anatomy
Scrim; dashed drop outline; centred card with an upload icon, COPY-drop.hint and COPY-drop.kinds.

## Variants & states
| Variant / state | Description |
|---|---|
| files dragged over · wide | A scrim covers the whole tool with a dashed accent outline inset from the edges and a centred card with an upload icon, COPY-drop.hint and COPY-drop.kinds. |
| files dragged over · narrow | The same overlay over the whole phone layout, including the top bar, tab bar and status row. |

## Behavior
- Appears when files (not text or links) are dragged over any part of the tool and disappears on drop, on leaving the tool, or on Esc.
- Dropping adds the files in the order given (F-001.R1, RULE-05); folders are refused with COPY-reason.folder.
- While an export runs the tool is locked and the overlay doesn't appear.
- With reduced motion the overlay appears without fading.

## Accessibility
- The hint is in a polite live region so screen-reader users dragging files hear COPY-drop.hint.
- Dropping is never the only way to add media: COPY-action.add_media, Mod+O and paste remain (NFR-06).
- The hint card keeps text contrast on the surface colour, independent of the scrim behind it.
