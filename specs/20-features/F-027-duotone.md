---
id: F-027
title: Recolour in two colours (duotone)
status: shipped
milestone: M-4
priority: P2
personas: [PER-02, PER-03]
entities: [ENT-Clip]
rules: [RULE-24, RULE-08, RULE-13]
screens: [SCR-Editor]
components: [CMP-Inspector, CMP-ColourPicker, CMP-Preview]
nfr: [NFR-03, NFR-06, NFR-07, NFR-08]
events: []
depends_on: [F-007, F-008]
---

## Intent
Two-colour images are a strong graphic style for titles, covers and short-form intros (D-053). Built-in pairs make it one tap; custom colours make it the user's own.

## Scope
- In: duotone of RULE-24 per video or photo clip: None, six built-in pairs, Custom with two colours from CMP-ColourPicker, Swap, Strength; resetting; Apply to all, Copy, Paste and Compare.
- Out: gradients with more than two colours; the user's own saved pairs (M-3).

## Requirements
- **R1** The user can choose None, a built-in pair or Custom, and set Strength; each pair shows a sample of its two colours and its name; the preview shows the result as the value changes.
- **R2** With a pair chosen, each pixel's perceived lightness (CIELAB L* ÷ 100) places it on a smooth gradient from the shadows colour (black) to the highlights colour (white); Strength mixes it with the incoming picture, and at 0 the result equals None (RULE-24).
- **R3** In Custom, the user can set the shadows colour and the highlights colour with the colour picker, by pointer, touch or keyboard, and Swap exchanges them.
- **R4** Duotone applies last among the colour steps (RULE-24 order), the same in the preview and the export (NFR-08), with preview playback kept smooth (NFR-03).
- **R5** The user can reset Strength or the whole tool; Reset all, Apply to all, Copy, Paste and Compare include it (RULE-24).

## Acceptance criteria
- **AC1** Given duotone at None, when the user chooses Midnight & Peach, then the preview shows the clip in those two colours at Strength 100, as one undo step; given Strength 40, when the user chooses Plum & Gold, then Strength starts at 100. (R1)
- **AC2** Given the grey ramp and a pair at Strength 100, when rendered, then the black step matches the shadows colour and the white step the highlights colour within ΔE00 1, the step at L* 50 matches the gradient's midpoint within ΔE00 1, output lightness runs in one direction, and in the full-precision result no two adjacent steps differ by more than four times the largest adjacent difference at default. (R2)
- **AC3** Given a pair at Strength 0, when the 24-patch chart is rendered, then it matches None within ΔE00 < 0.5; at Strength 50, each patch lies between the None result and the Strength 100 result. (R2)
- **AC4** Given Custom, when the user sets the highlights colour to #FFD400 by typing the hex code, then the preview's light tones show it; when the user picks Swap, then the two colours exchange as one undo step. (R3)
- **AC5** Given a clip that never had a duotone, when the user chooses Custom, then its colours start as Midnight & Peach's; given Plum & Gold chosen, then None, when the user chooses Custom, then its colours start as Plum & Gold's. (R3)
- **AC6** Given duotone on, when the user sets Red Saturation +100 in the colour mixer or a look, then the output still uses only the two chosen colours (at Strength 100), because duotone applies after them. (R4)
- **AC7** Given a 1080p clip with duotone on with every other colour tool the build has and every adjustment on, when it plays on the reference phone, then it meets NFR-03, and its export matches the preview within NFR-08. (R4)
- **AC8** Given a pair at Strength 40, when the user resets Strength, then it returns to 100; when the user resets duotone or picks Reset all, then it returns to None and a later Custom starts from Midnight & Peach; given clip 1 with duotone, Apply to all, Copy and Paste carry it, and holding compare shows clip 1 without it. (R5)

## UX notes
In CMP-Inspector's Adjust section, the collapsible group COPY-colour_tools.group_duotone with COPY-colour_tools.reset_tool and COPY-colour_tools.changed. The choice COPY-duotone.pairs offers None (shown as COPY-duotone.none), the pair names COPY-duotone.pair_midnight_peach, COPY-duotone.pair_plum_gold, COPY-duotone.pair_teal_cream, COPY-duotone.pair_indigo_pink, COPY-duotone.pair_forest_lime and COPY-duotone.pair_ink_coral, and COPY-duotone.custom. Custom shows COPY-duotone.shadows and COPY-duotone.highlights, each opening CMP-ColourPicker, and COPY-duotone.swap. COPY-duotone.strength is unavailable while None is chosen. The pairs' colours are in `30-experience/looks.md` "Duotone pairs". The group shows COPY-colour_tools.changed and its Reset only while a pair or Custom is chosen; at None the remembered colours are kept but not shown as changed (Reset all still forgets them).

## Edge cases
- The shadows colour lighter than the highlights colour → allowed; the picture's lightness is inverted.
- Both colours the same → the picture becomes one flat colour (by Strength).
- Changing a colour in Custom, then choosing a pair → the pair's colours replace them; choosing Custom again starts from that pair.

## Open questions
- [x] Q4: six built-in pairs with the names and colours in looks.md, signed off by the owner during design like the looks. Confirmed by owner (D-053 Q4).
