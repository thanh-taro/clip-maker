---
id: CMP-Preview
title: Preview
status: ready
tokens: [font.family.body, font.family.mono, font.weight.medium, font.weight.semibold, border.width.hairline, border.width.focus, motion.duration.fast, color.dark.accent, color.light.accent, color.dark.bg, color.light.bg, color.dark.chrome, color.light.chrome, color.dark.fg, color.light.fg, color.dark.focus, color.light.focus, color.dark.line, color.light.line, color.dark.lineStrong, color.light.lineStrong, color.dark.muted, color.light.muted, color.dark.onAccent, color.light.onAccent, color.dark.previewHandle, color.light.previewHandle, color.dark.previewOutline, color.light.previewOutline, color.dark.selection, color.light.selection, color.dark.surface, color.light.surface, color.dark.surface2, color.light.surface2, color.dark.workArea, color.light.workArea, text.color.black, text.color.white, space.5, space.3, space.1_5, space.2_5, radius.sm, space.3_5, font.size.xs, space.1, radius.md, font.size.md, font.size.sm, space.2, radius.pill, font.size.input, font.size.lg, space.4, space.0_5, radius.xs, font.size.2xs, font.size.base, size.toolButton, size.control, size.handle, size.handleHit, size.targetMin, size.icon.sm, motion.duration.slow]
---

## Purpose
Shows the project frame at the playhead, with play controls, and handles direct placement of clips and text.

## Anatomy
Frame area on the work area; transport with Previous frame (COPY-action.prev_frame), Play/Pause (COPY-action.play, COPY-action.pause), Next frame (COPY-action.next_frame), the time (COPY-time.position) and Full screen (COPY-action.full_screen); placement outline and handles on the selected clip or text layer.

## Variants & states
| Variant / state | Description |
|---|---|
| default | The frame at the playhead with everything applied. The time reads m:ss for the current time, then the frame number as a separate muted suffix, then the muted total length in m:ss (D-039). |
| clip selected | Violet placement outline and eight white placement handles around the selected clip while the playhead is within it (not during playback) (`size.handle`, hit area `size.handleHit` on touch); dragging anywhere in the frame moves it. |
| text selected, moving | Outline and handles around the text block; while moving with snapping on, the frame's centre lines and the safe margins show as dashed violet guides, the snapped one stronger (RULE-11). Each text layer shown at the playhead can be clicked or tapped to select it and double-clicked or double-tapped to edit it; with a mouse a drag can start at once, on touch only the selected text drags. The four corner handles and a two-finger pinch scale its size. |
| playing | Play becomes Pause; the time advances. |
| empty | The frame in its empty-project shape (16:9) shows the black background with COPY-empty.title; the transport is unavailable and the time reads 0:00. |
| full screen (maximised) | The frame fills the screen on black; Pause/Play, the time and Exit full screen (COPY-action.exit_full_screen) float on the translucent chrome bar at the bottom centre. |
| 16:9 fitted, black background | A 16:9 clip in a 9:16 frame shows the black background above and below (RULE-04). |
| 16:9 fitted, Blur background | The empty areas show a blurred, enlarged copy of the clip (RULE-04). |
| slow device | COPY-notice.slow_device as an info notice (surface, strong border, muted info icon, Dismiss) at the bottom centre of the preview area, per the D-039 notice placement; the preview stays usable. Violet is never used for notice text. |
| holding compare | A quiet pill COPY-preview.comparing on the chrome surface in the top-left corner; the frame shows the clip without adjustments and look (F-007). The same pill recipe is used for every temporary preview mode. |

## Behavior
- Shows the project frame at the playhead with everything applied (F-002 R1); the picture is never animated by the UI. Text layers are drawn above the look and adjustments.
- Dragging the selected clip moves it and pinching scales it; corner and edge handles scale; snapping follows RULE-07 and RULE-11 and the snapping toggle (RULE-14).
- Previous/Next frame step one frame; Play starts from the playhead and stops at the project end. Home/End go to the start/end (RULE-20, COPY-action.go_start, COPY-action.go_end).
- Full screen uses the browser's full screen, or maximises within the page when that is unavailable, without changing playhead or play state (F-002 R7). Esc leaves it.
- The slow-device notice can be closed and does not return in the session.
- Narrow widths keep Previous frame, Play/Pause, Next frame, the time and Full screen (the frame-step controls are RULE-21's equivalent of scrubbing); Go to start and Go to end stay on Home/End. The SCR-Editor narrow boards, which show Go to start/Go to end instead of frame step, are outdated on this point (build question 77).

## Accessibility
- The frame is an image named COPY-preview.label with the current time.
- Every gesture has a visible equivalent: placement controls in CMP-Inspector, frame step and play here (RULE-21).
- Handles have a hit area of `size.handleHit` on touch; transport buttons meet `size.targetMin` and become touch size on coarse pointers.
- The time is in monospace with tabular digits and is announced politely only when playback stops.
- The comparing pill and slow-device notice are status messages.

## Copy also used
COPY-action.dismiss, COPY-action.go_start, COPY-action.go_end
