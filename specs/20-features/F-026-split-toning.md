---
id: F-026
title: Tint shadows and highlights (split toning)
status: building
milestone: M-4
priority: P2
personas: [PER-02, PER-03]
entities: [ENT-Clip]
rules: [RULE-24, RULE-08, RULE-13]
screens: [SCR-Editor]
components: [CMP-Inspector, CMP-Preview]
nfr: [NFR-03, NFR-06, NFR-07, NFR-08]
events: []
depends_on: [F-007, F-008]
---

## Intent
A cool tint in the shadows and a warm one in the highlights gives footage a finished, cinematic feel that a single look can't tune (D-053).

## Scope
- In: split toning of RULE-24 per video or photo clip: shadows hue and strength, highlights hue and strength, balance; resetting; Apply to all, Copy, Paste and Compare.
- Out: three-way colour wheels (M-3); tints that change over time.

## Requirements
- **R1** The user can set Shadows hue, Shadows strength, Highlights hue, Highlights strength and Balance within RULE-24's ranges, and sees the result in the preview as the value changes.
- **R2** Dark tones take the shadows tint and light tones the highlights tint, keeping each pixel's lightness; Balance moves where the tints cross over; pure black and pure white stay unchanged (RULE-24).
- **R3** Split toning applies after the look (RULE-24 order), the same in the preview and the export (NFR-08), with preview playback kept smooth (NFR-03).
- **R4** The user can reset one value or the whole tool; Reset all, Apply to all, Copy, Paste and Compare include it (RULE-24).
- **R5** Every value can be set by keyboard or number field, and each hue slider announces its degrees and nearest colour range (NFR-06).

## Acceptance criteria
- **AC1** Given a clip, when the user raises Shadows strength to 60, then the preview's dark areas take a tint of the Shadows hue (210° by default) during the drag. (R1)
- **AC2** Given the grey ramp, Shadows hue 210° and strength 100, Highlights strength 0 and Balance 0, when rendered, then the step at lightness 20 has C* of at least 10 and is at the working-space hue of the hue wheel's 210° colour (hue reached, RULE-24 *Measures*), the steps above lightness 65 change by less than ΔE00 0.5, every step keeps its lightness, and the steps within 1 of black and white change by less than ΔE00 0.5. (R2)
- **AC3** Given Shadows and Highlights strength 100, when Balance goes from −100 to +100, then the lightness at which the ramp turns from the shadows tint to the highlights tint falls from 80 to 20 (within 2), and in the full-precision result lightness stays in order, the tone weights change by no more than RULE-24's per-step bound, and no two adjacent steps differ by more than four times the largest adjacent difference at default. (R2)
- **AC4** Given the look Black & White Classic at 100 and Highlights strength 60, when rendered, then the light tones show the highlights tint, because split toning applies after the look. (R3)
- **AC5** Given a 1080p clip with split toning on with every other colour tool the build has and every adjustment on, when it plays on the reference phone, then it meets NFR-03, and its export matches the preview within NFR-08. (R3)
- **AC6** Given Shadows strength 50 and Balance 30, when the user resets Balance, then only it returns to 0; when the user resets split toning, then both strengths return to 0, the hues to 210° and 35°, and Balance to 0; Reset all does the same. (R4)
- **AC7** Given clip 1 with split toning, when the user picks Apply to all, copies and pastes, or holds compare, then the other clips get the same values as one undo step, the pasted clip matches, and compare shows clip 1 without it. (R4)
- **AC8** Given keyboard focus on Highlights hue, when the user presses Up, then the hue rises by 1°, and assistive technology reads the value with COPY-colour_tools.hue_value (for example "36°, Orange"; at the default 210°, "210°, Blue"); at 359° Up changes nothing. (R5)

## UX notes
In CMP-Inspector's Adjust section, the collapsible group COPY-colour_tools.group_split with COPY-colour_tools.reset_tool and COPY-colour_tools.changed. Rows: COPY-split.shadows with COPY-split.hue and COPY-split.strength, COPY-split.highlights with the same, and COPY-split.balance, whose value reads COPY-split.balance_shadows, COPY-split.balance_even or COPY-split.balance_highlights. Hue sliders show the hue wheel on their track and use COPY-colour_tools.hue_value; their accessible names are COPY-split.shadows_hue and COPY-split.highlights_hue, and the strengths' are COPY-split.shadows_strength and COPY-split.highlights_strength.

## Edge cases
- A hue set while its strength is 0 → no visible change until strength rises; the hue is kept.
- Split toning with Duotone on → Duotone applies after it and keeps only its lightness, so split toning shows little.
- A photo → same as a video clip.

## Open questions
- [x] Q3: default hues 210° (blue) for shadows and 35° (orange) for highlights, so raising a strength gives the familiar teal-and-orange at once. Confirmed by owner (D-053 Q3).
