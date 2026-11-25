---
id: F-025
title: Keep one colour (colour pop)
status: building
milestone: M-4
priority: P1
personas: [PER-02, PER-03]
entities: [ENT-Clip]
rules: [RULE-24, RULE-08, RULE-13]
screens: [SCR-Editor]
components: [CMP-Inspector, CMP-Preview]
nfr: [NFR-03, NFR-06, NFR-07, NFR-08]
events: []
depends_on: [F-007, F-024]
---

## Intent
Keeping one colour and turning everything else grey is a popular, eye-catching style for short videos (D-053). It should take one choice, not a mask.

## Scope
- In: colour pop of RULE-24 per video or photo clip: the kept colour range, Range and Amount; resetting; Apply to all, Copy, Paste and Compare.
- Out: keeping a hue picked from the preview (D-053 Q2); keeping more than one range; masks.

## Requirements
- **R1** The user can choose one colour range to keep, or None, and set Range and Amount; the preview shows the result as the value changes.
- **R2** Colours near the kept range's centre hue keep their colour; every other pixel loses Amount % of its chroma while keeping its lightness; the edge between kept and grey fades with no hard edge (RULE-24).
- **R3** Colour pop applies at its place in the RULE-24 order, the same in the preview and the export (NFR-08), with preview playback kept smooth (NFR-03).
- **R4** The user can reset one value or the whole tool; Reset all, Apply to all, Copy, Paste and Compare include it (RULE-24).
- **R5** Every choice and value can be set by keyboard or number field (NFR-06).

## Acceptance criteria
- **AC1** Given a clip and colour pop at None, when the user chooses Red, then the preview shows red colours kept and the rest grey, as one undo step; Range shows 50 and Amount 100. (R1)
- **AC2** Given the hue ring with Red kept, Range 0 and Amount 100, when it is rendered, then the Red centre step keeps its colour within ΔE00 1, the Yellow to Magenta centre steps end with C* below 2, and every step keeps its lightness (RULE-24 *Measures*). (R2)
- **AC3** Given Red kept, when Range goes from 0 to 100, then the kept span of the hue ring grows, and at every Range and Amount colour pop's keep weight on the ring changes continuously and by at most 1.5 ÷ (its fade width in steps) per step, in the full-precision result. (R2)
- **AC4** Given Red kept with Amount 50, when rendered, then hue-ring steps outside the kept span and its fade keep half their chroma (C* within 10 % of half the input's) and keep their lightness. (R2)
- **AC5** Given the hue ring with Red kept, Range 0 and Amount 100, when the user sets Orange Hue to −100 in the colour mixer, then the Orange centre step, now at the Red centre's hue, keeps its colour (C* within 10 % of the mixed colour's), because colour pop applies after the mixer. (R3)
- **AC6** Given a 1080p clip with colour pop on with every other colour tool the build has and every adjustment on, when it plays on the reference phone, then it meets NFR-03, and its export matches the preview within NFR-08. (R3)
- **AC7** Given colour pop on Blue with Range 70, when the user resets Range, then it returns to 50 and Blue stays; when the user resets colour pop, then it returns to None with its defaults; when the user picks Reset all, then it returns to None. (R4)
- **AC8** Given clip 1 with colour pop, when the user picks Apply to all, copies and pastes, or holds compare, then the other clips get the same colour pop as one undo step, the pasted clip matches, and compare shows clip 1 without it. (R4)
- **AC9** Given keyboard focus on the kept colour choice, when the user presses the arrow keys, then the choice moves between None and the eight ranges; given focus on Amount, when the user types 40, then Amount is 40. (R5)

## UX notes
In CMP-Inspector's Adjust section, the collapsible group COPY-colour_tools.group_pop with COPY-colour_tools.reset_tool and COPY-colour_tools.changed. The choice COPY-pop.colour offers None (shown as COPY-pop.none) and the eight range names (COPY-range.red … COPY-range.magenta); then COPY-pop.range and COPY-pop.amount, unavailable while None is chosen. COPY-pop.help explains the effect under the choice. The group shows COPY-colour_tools.changed and its Reset only while a colour is kept; at None, Range and Amount are kept but not shown as changed (Reset all still returns them to default).

## Edge cases
- A clip with no colour near the kept range → the whole picture turns grey (by Amount).
- Choosing None, then a colour again → Range and Amount keep their last values.
- A black and white look after colour pop → the kept colour turns grey too; the look applies after colour pop (RULE-24).

## Open questions
- [x] Q2: the kept colour is one of the eight colour ranges, not a hue picked from the preview (a radio choice works on phones and with a keyboard with no eyedropper in 1.2.0, and uses the same ranges as the colour mixer; the eyedropper arrives with F-028 in 1.3.0 and could be added here later). Confirmed by owner (D-053 Q2).
