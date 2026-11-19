---
id: CMP-MediaPanel
title: Media panel
status: ready
tokens: [font.family.body, font.family.mono, font.weight.medium, font.weight.semibold, border.width.hairline, border.width.focus, motion.duration.fast, color.dark.accent, color.light.accent, color.dark.bg, color.light.bg, color.dark.chrome, color.light.chrome, color.dark.danger, color.light.danger, color.dark.dangerBg, color.light.dangerBg, color.dark.fg, color.light.fg, color.dark.focus, color.light.focus, color.dark.line, color.light.line, color.dark.lineStrong, color.light.lineStrong, color.dark.muted, color.light.muted, color.dark.onAccent, color.light.onAccent, color.dark.selection, color.light.selection, color.dark.surface, color.light.surface, color.dark.surface2, color.light.surface2, color.dark.trackAudio, color.light.trackAudio, color.dark.waveform, color.light.waveform, space.5, space.3, space.1_5, space.2_5, radius.sm, space.3_5, font.size.xs, space.1, radius.md, font.size.md, font.size.sm, space.2, radius.pill, font.size.input, font.size.lg, space.4, space.0_5, radius.tile, radius.xs, space.6, font.size.base, size.panel, size.toolButton, size.touchTarget, size.targetMin, size.icon.sm, size.icon.md, motion.duration.base]
---

## Purpose
Lists the session's sources, to add them to the timeline again or remove them.

## Anatomy
Header with COPY-media.title, Add media (COPY-action.add_media) and Close (COPY-action.close); source rows with thumbnail and kind icon, name, kind (COPY-media.kind_video, COPY-media.kind_photo, COPY-media.kind_audio) and duration in m:ss; Add to timeline (COPY-media.place_again) as a text-and-icon button; Delete (COPY-action.delete).

## Variants & states
| Variant / state | Description |
|---|---|
| sources (wide drawer) | Left drawer. Each row: thumbnail with a kind icon, the name (ellipsis), kind and duration, and below them Add to timeline (plus icon and label, never an undo-like arrow) and Delete. The hovered row fills with the hover surface. Below the sources: the checking row and the refused group. |
| checking | The file being checked shows a progress icon, COPY-media.checking, its position in the batch (COPY-media.queue), a progress bar and Cancel (COPY-action.cancel). |
| refused | A group titled COPY-media.refused with an error icon, both in the danger colour on the danger background; each refused file shows its name in semibold and its reason (COPY-reason.unsupported, COPY-reason.too_large and the other reasons) in the normal text colour, with Dismiss (COPY-action.dismiss). |
| empty (wide drawer) | COPY-media.empty, an outlined Add media button (the filled style stays reserved for Export) and COPY-empty.drop_hint. |
| narrow / sources | Bottom sheet (at most 40 % of the height, overlaying the timeline) with a grabber, title, Add media and Close; touch-size rows with Add to timeline and Delete on the right; the list scrolls with a fade at the cut. |
| narrow / empty · vi-VN | The empty sheet in Vietnamese: COPY-media.empty and the outlined Add media fit without truncation. |

## Behavior
- Opens from Add media's drawer on wide layouts and from Add media in the Edit tab on narrow layouts (SCR-Editor, D-038). Add media outside the panel (toolbar, empty state) opens the panel and the file picker together; the panel's own Add media opens only the picker.
- During a batch only the checking row shows; the files whose check finished appear together when the batch ends or is cancelled, as one undo step (RULE-13).
- Thumbnails come from each video's first decoded frame and from each photo; audio rows show the kind icon. A photo row shows the 3 s it gets when placed (RULE-05) as its duration.
- Add to timeline adds a new clip of the whole source at the end of the main track, or audio per RULE-12, as one undo step (F-001 AC14).
- Delete removes the source and all its clips as one undo step; the main track closes its gaps (F-001 AC6).
- Cancel keeps finished files and drops the one being checked and the rest (F-001 R6).
- Refused items stay listed until dismissed or the panel closes.
- Esc with focus in the panel closes it and returns focus to the control that opened it (Add media): the narrow sheet, a modal dialog, from anywhere in it; the wide drawer, which isn't modal, too, unless an open dialog, popover or menu, or CMP-TextEditor, takes that Esc first (RULE-20).

## Accessibility
- The panel is a complementary region (a dialog on narrow) named COPY-media.title; sources form a list.
- Each row's buttons include the source name in their accessible description.
- Progress is announced as a status message; refusals are announced once.
- Touch rows and buttons meet RULE-21; desktop buttons meet `size.targetMin`.

## Copy also used
COPY-action.close, COPY-action.dismiss, COPY-empty.drop_hint
