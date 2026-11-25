---
id: CMP-ColourPicker
title: Colour picker
status: ready
tokens: [font.family.body, font.family.mono, font.size.sm, font.size.input, border.width.hairline, border.width.focus, color.dark.surface, color.light.surface, color.dark.line, color.light.line, color.dark.lineStrong, color.light.lineStrong, color.dark.fg, color.light.fg, color.dark.muted, color.light.muted, color.dark.focus, color.light.focus, color.dark.danger, color.light.danger, text.color.white, text.color.black, text.color.red, text.color.orange, text.color.yellow, text.color.green, text.color.cyan, text.color.blue, text.color.purple, text.color.pink, size.swatch, size.touchTarget, size.targetMin, size.field, space.2, space.3, radius.sm, radius.md]
---

## Purpose
Choose any colour by tapping a preset, moving hue, saturation and lightness sliders, or typing a hex code, on desktop, phone and keyboard alike (F-027, F-028).

## Anatomy
A colour button (swatch plus its label, value COPY-picker.current) opens the picker, titled COPY-picker.title: a before/after swatch pair (the colour when it opened, and now); the presets COPY-picker.presets (the ten RULE-11 palette swatches, named COPY-colour.white to COPY-colour.pink); sliders with number fields COPY-picker.hue (0–359, the hue wheel on its track), COPY-picker.saturation (0–100) and COPY-picker.lightness (0–100), each track drawn with the colours it reaches; the field COPY-picker.hex; and COPY-picker.done.

## Variants & states
| Variant / state | Description |
|---|---|
| wide | A popover anchored to its colour button, inside the inspector's width. |
| narrow | Opens inside the Adjust sheet in place of the sheet's body, with COPY-picker.done at the top as the way back. A fixed top part holds the before/after swatch pair and the hex field; below it the presets are one horizontally scrolling row of ten, then the three sliders, which scroll within the sheet. All rows at touch size, label above control, so it fits at 320 px. |
| hex invalid | The field is marked invalid with COPY-picker.hex_invalid under it; the colour keeps its last valid value. |
| refused (colour replace From) | For a From colour (RULE-25), a Saturation drag stops at the lowest value that is not grey, with COPY-notice.replace_grey under the field; a typed or preset grey is refused with the same notice, and the colour reverts to its last value. |

## Behavior
- Changes apply live to the preview; each slider movement, preset tap or confirmed hex entry is one undo step (RULE-13). Closing the picker changes nothing.
- Hue, saturation and lightness are those of the sRGB colour (the hue wheel of RULE-24); the hex field shows the result in upper case and accepts `#RGB` or `#RRGGBB`, with or without `#`, on Enter or leaving the field.
- Esc or COPY-picker.done closes it and returns focus to its colour button; a click outside closes the wide popover.

## Accessibility
- The colour button is named by its label and reads its value (COPY-picker.current). The picker is a dialog named COPY-picker.title; focus starts on the hue slider.
- Presets are a radio group with colour names; sliders have value text and paired number fields (NFR-06); swatches and sliders have touch-size hit areas (RULE-21).
- Colour is never the only cue: every swatch has a name or a hex value next to it.
