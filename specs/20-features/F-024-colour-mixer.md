---
id: F-024
title: Mix colours by range
status: building
milestone: M-4
priority: P1
personas: [PER-02, PER-03]
entities: [ENT-Clip]
rules: [RULE-24, RULE-08, RULE-13, RULE-20]
screens: [SCR-Editor]
components: [CMP-Inspector, CMP-Preview]
nfr: [NFR-03, NFR-06, NFR-07, NFR-08]
events: []
depends_on: [F-007]
---

## Intent
A sky that is too cyan or skin that is too red needs one colour changed without touching the rest. The colour mixer gives hue, saturation and lightness per colour range, the control people know from photo apps (D-053).

## Scope
- In: the colour mixer of RULE-24 per video or photo clip: eight colour ranges, three values each; resetting; carrying it with Apply to all, Copy, Paste and Compare.
- Out: other colour tools (F-025, F-026, F-027, F-028); curves and colour wheels (M-3); values that change over time.

## Requirements
- **R1** The user can choose any colour range of the selected clip and set its Hue, Saturation and Lightness within RULE-24's ranges, and sees the result in the preview as the value changes.
- **R2** Each value changes only its range's colours, blending smoothly into the neighbouring ranges, and never changes grey pixels (RULE-24 *Quality*).
- **R3** The mixer applies at its place in the RULE-24 order, the same in the preview and the export (NFR-08), with preview playback kept smooth (NFR-03).
- **R4** The user can reset one value or the whole mixer; Reset all, Apply to all, Copy, Paste and Compare include the mixer (RULE-24 *Reset, copy and compare*).
- **R5** Every value can be set by keyboard or number field (NFR-06), and each range with a changed value is marked as changed, visibly and for assistive technology.

## Acceptance criteria
- **AC1** Given a clip showing the hue-ring fixture with the Red range shown, when the user drags Red Saturation to −100 while paused, then the preview updates during the drag, and the ring's Red centre step ends with C* below 2. (R1)
- **AC2** Given the hue ring, when Orange Hue is set to +100, then the ring's Orange centre step reaches the Yellow centre's hue (hue reached, RULE-24 *Measures*), and the steps from the Aqua centre step to the Magenta centre step change by less than ΔE00 0.5. (R2)
- **AC3** Given the grey ramp and the hue ring, when each of the 24 values is set to −100 and to +100 (one at a time, then all at once, then neighbouring ranges in opposite directions), then no grey-ramp step changes by ΔE00 0.5 or more, and in the full-precision result every range weight changes continuously and by no more than RULE-24's per-step bound across the ring, and Hue and Saturation keep lightness. (R2)
- **AC4** Given every mixer value at 0, when the 24-patch chart is previewed and exported, then the output matches the clip without the mixer within ΔE00 < 0.5. (R3)
- **AC5** Given a clip with Saturation (RULE-08) at −100, when the user sets Red Saturation to +100, then the picture stays grey (C* below 2 everywhere), because the mixer applies after Saturation. (R3)
- **AC6** Given a 1080p clip with all 24 mixer values non-zero, every adjustment non-zero, a look and every other colour tool the build has on, when it plays on the reference phone, then it meets NFR-03, and its export matches the preview within NFR-08. (R3)
- **AC7** Given Red Hue +20 and Blue Lightness −30, when the user resets Red Hue, then only it returns to 0; when the user resets the colour mixer, then all 24 values return to 0; and given Brightness +30 and Green Saturation +40, when the user picks Reset all, then both return to 0 and the look is kept. (R4)
- **AC8** Given three clips and clip 1 with mixer values, when the user picks Apply to all, then clips 2 and 3 get clip 1's mixer values and one undo restores theirs; when the user copies clip 1 and pastes onto clip 3, then clip 3's mixer matches clip 1's; when the user holds compare, then the preview shows clip 1 without its mixer, and no undo step exists. (R4)
- **AC9** Given keyboard focus on the range choice, when the user presses Right, then the next range is shown and no undo step exists; given focus on its Hue slider, when the user presses an arrow key or types 25 in its field, then the value changes by 1 or is set to 25, and the range's choice is named as changed (COPY-mixer.range_changed). (R5)

## UX notes
In CMP-Inspector's Adjust section, the collapsible group COPY-colour_tools.group_mixer, with its group Reset (COPY-colour_tools.reset_tool) and the changed mark (COPY-colour_tools.changed) while any value differs from 0. The range choice COPY-mixer.range offers COPY-range.red, COPY-range.orange, COPY-range.yellow, COPY-range.green, COPY-range.aqua, COPY-range.blue, COPY-range.purple and COPY-range.magenta; a changed range reads COPY-mixer.range_changed. The chosen range's sliders are COPY-mixer.hue, COPY-mixer.saturation and COPY-mixer.lightness, named for assistive technology with COPY-mixer.slider_name.

## Edge cases
- A black and white clip → every pixel is grey, so the mixer changes nothing.
- Hue shifts in opposite directions on neighbouring ranges (Red +100, Orange −100) → colours between them cross over smoothly; there is no hard edge.
- A photo → same as a video clip.
- Saturation +100 on an already saturated colour → its chroma is limited to what the output can show, keeping its hue and lightness.

## Open questions
- [x] One feature per colour tool, with their shared behaviour once in RULE-24, so each tool is built, tested and released on its own. Confirmed by owner (D-053 Q1).
