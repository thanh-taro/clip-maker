---
id: F-007
title: Adjust colour and light
status: building
milestone: M-1
priority: P0
personas: [PER-02, PER-03, PER-04]
entities: [ENT-Clip]
rules: [RULE-08, RULE-13, RULE-20]
screens: [SCR-Editor]
components: [CMP-Inspector, CMP-Preview]
nfr: [NFR-03, NFR-08, NFR-06]
events: []
depends_on: [F-003]
---

## Intent
Phone footage is often too dark, flat or blue. Strong, precise colour and light controls let anyone fix it, or give it a style, without a heavy editor (D-009).

## Scope
- In: the twelve adjustments of RULE-08 per video or photo clip; resetting one or all; copying to other clips.
- Out: looks (F-008); curves, colour wheels and masks (M-2/M-3); adjustments that change over time.

## Requirements
- **R1** The user can set each adjustment of RULE-08 on the selected clip, within its range, and see the result in the preview as the value changes.
- **R2** Adjustments are applied in the order of RULE-08 and keep the picture's full range at every setting.
- **R3** The user can reset one adjustment, or all of them, to default.
- **R4** The user can apply the selected clip's adjustments and look to every clip (Apply to all) as one undo step, or copy them and paste them onto another clip.
- **R5** Changing an adjustment keeps preview playback smooth (NFR-03), and the export matches the preview's colours (NFR-08).
- **R6** Every adjustment can be set precisely with a keyboard or a number field, not only by dragging (NFR-06).
- **R7** Holding the compare control, by pointer, touch or its key (RULE-20), shows the selected clip without its adjustments and look; releasing it restores them. It is not an undo step.

## Acceptance criteria
- **AC1** Given a dark clip, when the user raises Brightness to +40 while paused, then the preview updates continuously during the drag and settles at +40. (R1)
- **AC2** Given the 256-step grey-ramp fixture with Grain at 0, when previewed and exported at default settings, then output matches input within ΔE00 < 0.5; and at each adjustment's minimum and maximum, the full-precision result never reverses, keeps non-clipped steps distinct and has no adjacent steps differing by more than twice the default's largest difference, while the 8-bit preview and the frame the export encodes reverse by no more than ΔL* 0.5 and stay within ΔE00 1 of the full-precision result, with Vignette judged at each position separately, and the exported file matches the preview within NFR-08 (RULE-08). (R2)
- **AC3** Given every adjustment at a non-zero value, when the user resets Temperature, then only Temperature returns to 0; when the user picks Reset all, then all return to default. (R3)
- **AC4** Given three clips and clip 1 with adjustments and a look, when the user picks Apply to all, then clips 2 and 3 get the same values, and one undo restores their previous values. (R4)
- **AC5** Given clip 1's adjustments copied, when the user pastes them onto clip 3, then clip 3 matches clip 1's adjustments and look. (R4)
- **AC6** Given a 1080p clip with every adjustment non-zero on the reference phone, when it plays, then it meets NFR-03, and its export matches the preview within NFR-08's colour tolerance. (R5)
- **AC7** Given keyboard focus on Saturation, when the user presses the arrow keys or types 25, then the value changes by 1 per key press, or is set to 25. (R6)
- **AC8** Given Grain 50, when the same frame is shown twice in the preview and once exported at the preview's resolution, then the grain is pixel-identical each time in the preview and in the frame the export encodes. (R2)
- **AC9** Given a clip with a look and Brightness +50, when the user holds compare, then the preview shows the clip without them; on release they return, and no undo step exists. (R7)

## UX notes
In CMP-Inspector, the adjust section uses COPY-inspector.adjust and the adjustment labels COPY-adjust.brightness, COPY-adjust.contrast, COPY-adjust.highlights, COPY-adjust.shadows, COPY-adjust.saturation, COPY-adjust.vibrance, COPY-adjust.temperature, COPY-adjust.tint, COPY-adjust.sharpen, COPY-adjust.vignette, COPY-adjust.grain and COPY-adjust.fade, plus COPY-action.reset, COPY-action.reset_all, COPY-action.apply_all, COPY-action.copy_look and COPY-action.paste_look. A before/after hold control (COPY-action.compare) shows the clip without adjustments and look while held.

## Edge cases
- Adjusting a photo → same as a video clip.
- Pasting with no copied adjustments → the paste control is unavailable.

## Open questions
