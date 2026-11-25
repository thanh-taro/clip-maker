---
id: F-028
title: Replace a colour
status: draft
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
- **R2** The user can pick a From colour by clicking or tapping the selected clip in the preview, by a touch magnifier, or by moving a marker with the keyboard, and can type or choose From and To with the colour picker (RULE-25 *Eyedropper*, NFR-06).
- **R3** Matched pixels take the To colour's hue and proportional chroma, keeping their lightness and shading; Range and Softness set how far matching reaches, with no hard edges; grey pixels never change (RULE-25, RULE-24 *Quality*).
- **R4** A grey From colour is refused with an explanation, and From stays as it was.
- **R5** Colour replace applies first in the RULE-24 order, the same in the preview and the export (NFR-08), with preview playback kept smooth (NFR-03).
- **R6** The user can reset one value, one replacement or the whole tool; Reset all, Apply to all, Copy, Paste and Compare include it (RULE-24).
- **R7** The tool states that it matches colour, not objects.

## Acceptance criteria
- **AC1** Given a clip with no replacement, when the user picks Add colour to replace and clicks a red area of the preview, then a replacement is added with From and To set to that colour, as one undo step, and the picture is unchanged. (R1)
- **AC2** Given three replacements, when the user looks for Add colour to replace, then it is unavailable with COPY-replace.limit; when the user removes one, then it is available again. (R1)
- **AC3** Given pick mode on a phone, when the user presses on the preview and drags, then a magnifier shows the colour under the finger, and lifting the finger picks it. (R2)
- **AC4** Given pick mode started by keyboard, when the user presses Right twice with Shift and then Enter, then the marker moves 20 % of the frame to the right of the clip's centre and From is set to the colour there; when the user presses Esc instead, then pick mode ends and nothing changes. (R2)
- **AC5** Given the playhead outside the selected clip, when the user starts pick mode, then playback pauses and the playhead moves to the clip's first frame, without an undo step. (R2)
- **AC6** Given a red ball on a grey floor, From red and To #0050FF at Range 30 and Softness 50, when rendered, then the ball turns blue in lit and shaded parts alike, each pixel's L* is within 2 of its input, and the floor changes by less than ΔE00 0.5. (R3)
- **AC7** Given the hue ring and one replacement, when Range and Softness are each set from 0 to 100, then the hue span that changes grows as RULE-25 states (within 3°), and in the full-precision result no two adjacent steps differ by more than four times the largest adjacent difference at default. (R3)
- **AC8** Given pick mode, when the user clicks a grey wall, then From is not changed and COPY-notice.replace_grey is shown. (R4)
- **AC9** Given From red and To blue, when the user sets Temperature +50, then the same areas are still replaced, because colour replace applies first. (R5)
- **AC10** Given a 1080p clip with three replacements with every other tool and adjustment on, when it plays on the reference phone, then it meets NFR-03, and its export matches the preview within NFR-08. (R5)
- **AC11** Given two replacements, when the user resets the first one's Range, then only it returns to 30; when the user resets colour replace or picks Reset all, then both replacements are removed; Apply to all, Copy and Paste carry them, and holding compare shows the clip without them. (R6)
- **AC12** Given the colour replace group open, when the user reads it, then COPY-replace.help is shown, in both languages. (R7)

## UX notes
In CMP-Inspector's Adjust section, the collapsible group COPY-colour_tools.group_replace with COPY-colour_tools.reset_tool, COPY-colour_tools.changed and COPY-replace.help. COPY-replace.add starts pick mode; each replacement is titled COPY-replace.item and holds COPY-replace.from and COPY-replace.to (each opening CMP-ColourPicker), COPY-replace.pick, COPY-replace.range, COPY-replace.softness and COPY-replace.remove. In pick mode CMP-Preview shows COPY-replace.picking (or COPY-replace.picking_keys when started by keyboard) with COPY-replace.pick_cancel, the marker named COPY-replace.marker, and announces COPY-replace.picked. Refusals use COPY-notice.replace_grey; the limit uses COPY-replace.limit.

## Edge cases
- Two replacements matching the same pixel → both apply, in list order (RULE-25).
- A clip whose From colour also appears in the background or skin → all of it changes; the help text says the tool matches colour, not objects.
- A pick near the clip's edge → the disc samples only the clip's own picture.
- Picking during a cross-fade → the selected clip's picture is sampled, not the blend.
- Pick mode and a selection change, New project or export start → pick mode ends without a change.

## Open questions
- [ ] Q5: the eyedropper samples the source picture before every adjustment, colour tool and look, because colour replace is the first step (recommended). The colour the user sees on a graded preview may differ from the From swatch; the swatch shows the sampled source colour. Confirm, or sample the graded preview instead (then From would not match the colours colour replace compares).
- [ ] Q6: a new replacement starts with To equal to From (no change until To is set) (recommended), or with To set to the From hue turned 180°, which shows an effect at once.
- [ ] Q7: Range default 30 (hue within about 21°) and Softness default 50 — to be tuned on the reference clips during design.
