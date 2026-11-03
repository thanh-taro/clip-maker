---
id: CMP-Notice
title: Notice
status: ready
tokens: [border.width.focus, border.width.hairline, color.dark.accent, color.dark.bg, color.dark.danger, color.dark.dangerBg, color.dark.fg, color.dark.focus, color.dark.line, color.dark.lineStrong, color.dark.muted, color.dark.onAccent, color.dark.success, color.dark.surface, color.dark.surface2, color.dark.warnBg, color.dark.workArea, color.light.accent, color.light.bg, color.light.danger, color.light.dangerBg, color.light.fg, color.light.focus, color.light.line, color.light.lineStrong, color.light.muted, color.light.onAccent, color.light.success, color.light.surface, color.light.surface2, color.light.warnBg, color.light.workArea, font.family.body, font.family.mono, font.size.2xs, font.size.md, font.size.sm, font.size.xs, motion.duration.base, radius.md, radius.pill, radius.sm, radius.tile, size.icon.md, size.icon.sm, size.popover, size.targetMin, size.touchTarget, space.0_5, space.1, space.1_5, space.2, space.3, space.4]
---

## Purpose
Short, non-blocking messages: results, errors, progress.

## Anatomy
Leading icon; message (and, for errors, a title and a list); optional action; close.

## Variants & states
One recipe for every notice: a floating card on the surface with a strong border, a leading icon, text in the normal text colour, and a quiet close. The accent violet (focus) is never used in a notice.

| Variant / state | Description |
|---|---|
| success | Check icon in the success colour; COPY-export.done (file name in mono), COPY-notice.added, COPY-notice.applied_all. |
| info | Info recipe on the surface with normal text: COPY-notice.no_sound and COPY-notice.slow_device use a muted icon; COPY-notice.length_limited is always info (never a warning) and uses an accent info icon. |
| warning | Warning background, warning icon in the accent colour, normal text: COPY-notice.length_full, COPY-notice.no_audio_room, COPY-notice.split_too_close, COPY-notice.text_limit. Also shown in vi-VN. |
| error | Error background and border; error icon and the title COPY-error.refused_list in the danger colour; the list of name: reason items in the normal text colour with the file name in semibold. At most 3 items show; when there are more, a text button COPY-action.show_all expands the full list in place (the notice then scrolls inside a capped height). Reasons used: COPY-reason.unsupported, COPY-reason.too_large, COPY-reason.too_long, COPY-reason.too_big_picture, COPY-reason.too_short, COPY-reason.protected, COPY-reason.no_media, COPY-reason.codec, COPY-reason.folder and COPY-reason.too_many. |
| progress · wide | Upload icon in the accent colour; COPY-notice.adding, an accent progress bar, the current file as COPY-media.checking in muted text, and a quiet COPY-action.cancel (SCR-Editor adding). The same layout is used on every screen. |
| progress · narrow | The same content full width with touch-size Cancel. |
| placement · wide | Bottom-centre of the preview area, just above the transport and timeline, at most the popover width; the stack (see stack) grows upward. Never over the toolbar, inspector or timeline. |
| placement · narrow | Full width with side margins, anchored to the bottom of the preview just above the transport, so it never covers the timeline lanes, an open sheet or the tab bar. |
| stack | At most 2 notices show at once (newest at the bottom); any more fold into a chip COPY-notice.more (surface, strong border, pill, small text) under them. Activating the chip shows the hidden notices. |

## Behavior
- At most 2 notices show at once; a newer one replaces an older one of the same kind, an error is never replaced by info, and the rest fold into COPY-notice.more.
- Success notices hide after 4 seconds, info and warning after a few seconds; hovering or focusing them pauses the timer. Errors and progress stay until dismissed or finished.
- Every notice except progress has a close button (COPY-action.close). Cancel in the progress notice keeps files already checked and drops the rest (F-001.R6).
- The refused list covers every refused file of the batch: the first 3 show, and COPY-action.show_all reveals the rest; accepted files are still added (RULE-01).
- Notices never block the editor.

## Accessibility
- Success, info, warning and progress are polite live regions (status); errors are assertive (alert).
- Icon and wording carry the meaning, not colour alone; list text uses the normal text colour so long errors stay readable, and every text pair meets contrast on its background.
- Close and Cancel are real buttons with accessible names and at least the minimum target size; on a coarse pointer they meet RULE-21 touch targets (NFR-06). Timers are long enough to read and pause on focus (WCAG 2.2.1).

## Copy also used
COPY-notice.adding_label, COPY-notice.checking, COPY-media.checking
