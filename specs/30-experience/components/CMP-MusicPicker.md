---
id: CMP-MusicPicker
title: Music picker
status: ready
tokens: [font.family.body, font.family.mono, font.weight.medium, font.weight.semibold, border.width.hairline, border.width.focus, motion.duration.fast, color.dark.accent, color.light.accent, color.dark.bg, color.light.bg, color.dark.fg, color.light.fg, color.dark.focus, color.light.focus, color.dark.line, color.light.line, color.dark.lineStrong, color.light.lineStrong, color.dark.muted, color.light.muted, color.dark.onAccent, color.light.onAccent, color.dark.selection, color.light.selection, color.dark.surface, color.light.surface, color.dark.surface2, color.light.surface2, space.5, space.3, space.1_5, space.2_5, radius.sm, space.3_5, font.size.xs, space.1, radius.md, font.size.md, font.size.sm, space.2, radius.pill, font.size.input, font.size.lg, space.4, space.0_5, font.size.base, size.popover, size.toolButton, size.touchTarget, size.targetMin, size.icon.sm, size.icon.md, motion.duration.base]
---

## Purpose
Browse and preview the bundled music, then add a track at the playhead.

## Anatomy
Header (COPY-music.title) with Close (COPY-action.close); "your audio" row (COPY-music.your_audio_hint, COPY-music.your_audio); track list with Play preview (COPY-music.preview), title, length in m:ss, source and licence, and Add at playhead (COPY-music.add); a link to COPY-privacy.notices.

## Variants & states
| Variant / state | Description |
|---|---|
| popover / previewing | Popover (`size.popover` wide) anchored to Music. The track list scrolls with a fade at the cut; the previewing row is highlighted with the selection surface, its toggle reads Stop preview (COPY-music.stop, pressed) and a thin accent progress line runs under it. Licences and credits sits in the footer. |
| row / default | Play preview, title and meta line; Add at playhead is a quiet icon button whose accessible name is COPY-music.add. |
| row / hover | Row fills with the hover surface and Add at playhead shows as an accent text-and-icon button. |
| row / keyboard focus | As hover, with the violet focus ring on the focused control. |
| row / previewing | As in the popover: selection surface, Stop preview, progress line, labelled Add at playhead. |
| row / no audio room | Add at playhead is unavailable and COPY-notice.no_audio_room explains why under the row. |
| narrow | Bottom sheet (opened from the Audio tab, at most 40 % of the height) with grabber, title and Close; the your-audio hint and a full-width touch-size Your audio button; touch-size rows where Add at playhead is always an icon button with its label as accessible name. |
| narrow / Audio sheet with a selection | While a video or audio clip is selected, the sheet shows, under its title and Close, the selection's sound section at touch size: Volume (COPY-sound.volume) slider and field, Mute (COPY-action.mute), and Mute original sound (COPY-action.mute_all) for a video clip or Earlier/Later (COPY-action.time_earlier, COPY-action.time_later) for an audio clip; then Your audio and the tracks. |
| row / preview failed | A track's file can't be read: its preview stops (the row shows it stopped) and COPY-notice.music_unavailable shows (F-011 edge cases). |
| narrow · vi-VN (top) | The sheet's top in Vietnamese: title, hint and Your audio fit without truncation. |

## Behavior
- Opens from Music in CMP-Toolbar (narrow: the Audio tab, D-038). Only one preview plays at a time; closing the picker stops it.
- Add at playhead places the track per RULE-12 as one undo step, keeps the picker open and selects the new audio clip.
- Your audio opens the file picker for audio (F-001).
- Tracks are bundled and play offline (F-011 R7); every row shows title, source and licence (R6).

## Accessibility
- The picker is a dialog named COPY-music.title; tracks form a list.
- Preview buttons are toggles with a pressed state; their names include the track title.
- Esc closes and returns focus to Music; touch targets meet RULE-21.

## Copy also used
COPY-action.close, COPY-privacy.notices
