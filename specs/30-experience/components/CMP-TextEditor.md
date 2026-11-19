---
id: CMP-TextEditor
title: Text editor
status: ready
tokens: [font.family.body, font.family.mono, font.weight.medium, font.weight.semibold, border.width.hairline, border.width.focus, motion.duration.fast, color.dark.accent, color.light.accent, color.dark.bg, color.light.bg, color.dark.danger, color.light.danger, color.dark.dangerBg, color.light.dangerBg, color.dark.fg, color.light.fg, color.dark.focus, color.light.focus, color.dark.line, color.light.line, color.dark.lineStrong, color.light.lineStrong, color.dark.muted, color.light.muted, color.dark.onAccent, color.light.onAccent, color.dark.previewOutline, color.light.previewOutline, color.dark.selection, color.light.selection, color.dark.surface, color.light.surface, color.dark.surface2, color.light.surface2, color.dark.workArea, color.light.workArea, text.color.black, text.color.white, space.5, space.3, space.1_5, space.2_5, radius.sm, space.3_5, font.size.xs, space.1, radius.md, font.size.md, font.size.sm, space.2, radius.pill, font.size.input, font.size.lg, space.4, space.0_5, radius.clip, font.size.2xs, radius.trackItem, font.size.base, size.toolButton, size.touchTarget, size.icon.md, size.swatch]
---

## Purpose
Types text directly over the preview.

## Anatomy
Editable text box at the layer's position (COPY-text.field); a floating bar with the character count (COPY-text.count) and Done (COPY-text.done); the finish hint (COPY-text.finish_hint).

## Variants & states
| Variant / state | Description |
|---|---|
| caret | The text layer at its position is editable in place with a dashed violet outline and a caret; a floating bar above the frame shows the count and an outlined Done; COPY-text.finish_hint sits under the frame on wide layouts. |
| selection | Selected characters are highlighted in the placement-outline colour inside the layer. |
| vi-VN wrap | Composed Vietnamese text (sample "Đà Lạt 2026 — mùa hoa dã quỳ") wraps at 90 % of the frame's width; the wrap limits show as dashed guides while editing (RULE-11). |
| at the limit | The count turns to the error colour at 500 / 500 and COPY-text.char_limit shows as an error notice (danger icon, text in the normal colour on the danger background); further typing is not accepted and pasted text is shortened; text taller than the frame is cut off. |
| style Plain / Outline / Shadow / Box | The text renders in the chosen style; Box draws a rounded box at 70 % opacity in the box colour. |
| narrow, keyboard open | The top bar collapses to Undo, Redo and Done (COPY-action.done; Done lives only in the top bar, never in the style bar); the preview shrinks above a touch-size text bar with Font (pressed while its picker is open), Colour and Style (COPY-text.style) only, plus the read-only count, sitting on the on-screen keyboard. Font opens the same two-by-two font picker as CMP-Inspector. |

## Behavior
- Opens when a text layer is added or double-clicked/tapped, or when the selected text item on the timeline is activated again (Enter, Space or a second click; the first activation selects it); focus returns to the item when editing ends. Keyboard shortcuts are off while editing (RULE-20); Esc or Mod+Enter or Done finishes.
- Editing a layer that is not at the playhead moves the playhead into it (to its start, or after its text fade), which is not an undo step; editing pauses playback. When the preview can't draw the text (an empty main track), the field shows its letters in the layer's colour.
- Focus leaving the editor ends the session, so an inspector change made then is its own step; the phone editor's own Font, Colour and Style choices keep the session open and join its step.
- Adding plus typing until finish is one undo step; a layer left empty or whitespace is removed (RULE-11).
- Lines break where typed and wrap at 90 % of the frame's width; text taller than the frame is cut off.
- On narrow layouts the editor keeps the text visible above the on-screen keyboard; Colour and Style open the same swatches and segments as CMP-Inspector's text layer section.

## Accessibility
- The editable field is a multi-line text field named COPY-text.field with lang taken from the content's language when known.
- The count is announced politely when within 20 characters of the limit and when the limit is reached; the limit notice is an alert.
- Done is a real button; the narrow bar's controls meet RULE-21.

## Copy also used
COPY-text.finish_hint, COPY-text.typeface, COPY-text.colour
