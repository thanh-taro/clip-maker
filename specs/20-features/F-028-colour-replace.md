---
id: F-028
title: Replace a colour
status: shipped
milestone: M-5
priority: P2
personas: [PER-02, PER-03, PER-04]
entities: [ENT-Clip]
rules: [RULE-25, RULE-24, RULE-08, RULE-13, RULE-20, RULE-21]
screens: [SCR-Editor]
components: [CMP-Inspector, CMP-ColourPicker, CMP-Preview]
nfr: [NFR-03, NFR-06, NFR-07, NFR-08]
events: []
depends_on: [F-024, F-027]
---

## Intent
Turning a red jacket blue or a dull sky teal is a common wish that usually needs masks. Colour replace does it by colour, keeping shading, with a pick on the preview (D-053). It matches colour, not objects, and says so.

## Scope
- In: colour replace of RULE-25 per video or photo clip: up to three replacements, each with From and To colours, Range and Softness; the eyedropper by pointer, touch and keyboard; typed or picked colours; resetting; Apply to all, Copy, Paste and Compare.
- Out: selecting objects or areas (masks, M-3); tracking; replacing by lightness.

## Requirements
- **R1** The user can add up to three replacements to the selected clip, each starting from a colour picked on the preview, and remove any of them.
- **R2** The user can pick a From colour by clicking or tapping the selected clip in the preview, by a touch magnifier, or by moving a marker with the keyboard, and can type or choose From and To with the colour picker (RULE-25 *Picking*, NFR-06).
- **R3** Matched pixels move toward the To colour's hue and proportional chroma by their match weight, keeping their lightness and shading; Range and Softness set how far matching reaches, with no hard edges; grey pixels never change; a later replacement acts only on what earlier ones left (RULE-25, RULE-24 *Quality*).
- **R4** A grey From colour is refused with an explanation and changes nothing; a faint From colour is accepted with a hint that it changes only in part.
- **R5** Colour replace applies first in the RULE-24 order, the same in the preview and the export (NFR-08), with preview playback kept smooth (NFR-03).
- **R6** The user can reset one value or the whole tool; Reset all, Apply to all, Copy, Paste and Compare include it (RULE-24).
- **R7** The tool states that it matches colour, not objects.
- **R8** While picking, the preview shows the selected clip's ungraded source picture, which is what is sampled, and preview gestures and playback never change the clip (RULE-25 *Pick mode*).

## Acceptance criteria
Test pictures: the hue ring (RULE-24); the *ball fixture*, a disc whose pixels have working-space hue within 3° of #C8281E's, lightness from 40 to 75 (the span where sRGB can show that chroma) and chroma at least ¾ of #C8281E's, on a grey floor (C* below 2); and flat colour patches wider than the pick disc. A "ring step at h" is the hue-ring step at working-space hue h.
- **AC1** Given a clip with no replacement, when the user picks Add colour to replace, then the preview shows the clip's ungraded source picture; when the user clicks a flat red patch, then a replacement is added with From and To set to that patch's colour, as one undo step, pick mode ends, and the graded picture returns unchanged. (R1)
- **AC2** Given three replacements, when the user looks for Add colour to replace, then it is unavailable with COPY-replace.limit; when the user removes one, as one undo step, then it is available again. (R1)
- **AC3** Given pick mode on a phone, when the user presses on a flat patch and drags, then a magnifier shows the picture around the finger with a centre ring in the colour that would be picked, and lifting the finger sets From to that colour; the clip's placement is unchanged. (R2)
- **AC4** Given pick mode started by keyboard, when the user presses Shift+Right twice and then Enter, then the marker moves 20 % of the frame's width right of its start, its value reads COPY-replace.marker_value as it moves, and From is set to the patch colour there; when the user presses Esc instead, then pick mode ends and nothing changes. (R2)
- **AC5** Given the playhead on the selected clip, when the user starts pick mode, then playback pauses and the playhead stays; given the playhead outside it and the clip with a 0.5 s fade in, when the user starts pick mode, then the playhead moves to the clip's first frame after its fade in ends, without an undo step; given a fade in and an incoming cross-fade covering the whole clip, then it moves to the clip's last frame. (R2)
- **AC6** Given the ball fixture, From #C8281E and To #0050FF at Range 30 and Softness 50, when rendered, then every ball pixel reaches the To colour's hue and keeps its lightness (RULE-24 *Measures*), and the floor changes by less than ΔE00 0.5. (R3)
- **AC7** Given the hue ring, From the ring step at 30° and To the ring step at 210°, when Range and Softness are each set from 0 to 100 in steps of 10, then the steps with weight 1 span 5° + 0.55° × Range either side of 30°, the fade beyond them spans 2° + (full distance − 2°) × Softness ÷ 100 (each within 1°), and in the full-precision result the match weight changes continuously and by at most 1.5 ÷ (the fade distance in steps) per step. (R3)
- **AC8** Given pick mode started by Add colour to replace, when the user clicks a grey wall (C* below 2), then no replacement is added, COPY-notice.replace_grey is shown and pick mode stays on; given pick mode for Colour 1, then its From is unchanged. (R4)
- **AC9** Given From red and To blue, when the user sets Temperature +50, then every pixel's match weight equals its weight without Temperature, because colour replace applies first. (R5)
- **AC10** Given a 1080p clip with three replacements with every other colour tool and every adjustment on, when it plays on the reference phone, then it meets NFR-03, and its export matches the preview within NFR-08. (R5)
- **AC11** Given two replacements, when the user resets the first one's Range, then only it returns to 30; when the user resets colour replace or picks Reset all, then both replacements are removed; Apply to all, Copy and Paste carry them, and holding compare shows the clip without them. (R6)
- **AC12** Given the colour replace group open, when the user reads it, then COPY-replace.help is shown, in both languages. (R7)
- **AC13** Given the hue ring, From the ring step at 30°, To the ring step at 250°, Range 0 and Softness 100, when rendered, then every fade step's hue turns from its own hue in the direction From → To (decreasing hue), no step's C* falls below the smaller of its input C* and its full-match C* by more than 2, and fully matched steps land on 250°; with To the ring step at 210° (exactly opposite From), every matched step turns by increasing hue and full matches land on 210°; and with To the ring step at 185°, Range 30 and Softness 50, no two adjacent ring steps differ in output hue by more than 25°. (R3)
- **AC14** Given the hue ring, replacement 1 (From the ring step at 30°, To the step at 210°) and replacement 2 (From the step at 50°, To the step at 150°), both at Range 100, when rendered, then the step at 30° reaches 210° with its single-replacement C* within 2, no step's effective weights add up to more than 1, and swapping the two changes only steps that both match. (R3)
- **AC15** Given a flat patch with C* 8, when the user picks it, then it is accepted as From, COPY-notice.replace_faint is shown once, and with To #0050FF the patch's hue moves only part of the way, by the grey fade's weight. (R4)
- **AC16** Given pick mode with the clip selected, when the user drags or pinches on the preview, then the clip is not moved or scaled; when the user presses Play, then pick mode ends without a change and playback starts. (R8)
- **AC17** Given replacement 1 with To blue, when the user picks Pick from preview and clicks a green patch, then its From becomes that green and To stays blue, as one undo step. (R2)

## UX notes
In CMP-Inspector's Adjust section, the collapsible group COPY-colour_tools.group_replace with COPY-colour_tools.reset_tool, COPY-colour_tools.changed and COPY-replace.help. COPY-replace.add starts pick mode; each replacement is titled COPY-replace.item and holds COPY-replace.from and COPY-replace.to (each opening CMP-ColourPicker), COPY-replace.pick, COPY-replace.range, COPY-replace.softness and COPY-replace.remove. While To still equals From the To button reads COPY-replace.to_unset. In pick mode CMP-Preview shows COPY-replace.picking (or COPY-replace.picking_keys when started by keyboard) and COPY-replace.original with COPY-replace.pick_cancel, the marker named COPY-replace.marker with the value COPY-replace.marker_value, and announces COPY-replace.picked. Refusals use COPY-notice.replace_grey, faint colours COPY-notice.replace_faint; the limit uses COPY-replace.limit.

## Edge cases
- Two replacements matching the same pixel → the first in the list wins where it matches in full; in the fades their shares add up to at most 1 (RULE-25).
- A clip whose From colour also appears in the background or skin → all of it changes; the help text says the tool matches colour, not objects.
- A pick near the clip's edge → the disc counts only the clip's own picture.
- Text over the picked point → text layers are hidden in pick mode; the clip beneath is sampled.
- Picking during a cross-fade → only the selected clip is shown and sampled.
- A Blur background in pick mode → made from the ungraded source picture, like the clip shown.
- Colour pop keeping Red with red replaced by blue → the replaced area turns grey, because colour pop applies after colour replace; the mixer's Red range no longer affects the replaced pixels either.
- Apply to all and Paste → replace the target clip's list of replacements, never merge with it.
- Pick mode and a selection change, full screen, New project or export start → pick mode ends without a change.
- AC10 needs the reference phone; per the owner's device-check policy it is recorded as waived, not passed, when not run on a device.

## Open questions
- [x] Q5: the eyedropper samples the source picture before every adjustment, colour tool and look, because colour replace is the first step; pick mode shows that picture (RULE-25). Confirmed by owner (D-053 Q5).
- [x] Q6: a new replacement starts with To equal to From, so nothing changes until To is set. Confirmed by owner (D-053 Q6).
- [x] Q7: Range default 30 and Softness default 50, tunable on the reference clips during design. Confirmed by owner (D-053 Q7).
- [x] Q8: faint From colours (C* 2 to 12) are accepted with COPY-notice.replace_faint and change in part; greys stay refused. Decided under the owner's standing instruction (D-053 M3).
