# Spec review: F-028 Replace a colour + RULE-25 (for `ready`, M-5 / 1.3.0)

Lint: **1014 IDs, 4229 references, 0 errors, 0 warnings.**
Read: F-028, RULE-24/25, RULE-08/13/20/21, ADR-0017 (+ outcome), CMP-ColourPicker/Inspector/Preview, copy.md "Colour tools", NFR-03/06/07/08, project.schema.json, review-d053-spec.md.

## Verdicts
| Item | Verdict |
|---|---|
| F-028 | **not ready** (B1, M1-M8) |
| RULE-25 | **not ready** (B1, M1-M3, M5, M6); the rest of the rule is sound |
| CMP-Preview / CMP-Inspector / CMP-ColourPicker (replace parts) | ready after minor fixes (M4, M7, m-items) |
| Schema `colourTools.replace` | ready (maxItems 3, required fields, upper-case hex) |
| ADR-0017 §5/§7 | consistent; one sizing gap (m9) for a follow-up ADR/module note |

## Blocker

### B1. "Partly matched pixels change in proportion" does not say how, and it is the most visible part of the result
- `specs/10-domain/rules.md:46` (*Change*: "Partly matched pixels change in proportion"); ADR-0017 §5 ("target h, C × C_to/C_from, L kept") gives no blend either.
- Problem: in the Softness fade (and everywhere at weight < 1) two natural readings differ hugely: (a) mix in OKLab a/b (a straight line, so red→cyan passes through grey and dulls the edge), (b) rotate hue along the shorter arc and scale chroma (red→blue via magenta). Hue opposite at exactly 180° has no defined direction. Implementer and test oracle will pick differently; AC6/AC7 cannot catch it.
- Fix (RULE-25 *Change*): "A pixel matched with weight w (0 to 1) has its hue moved w of the way to the target hue along the shorter way round (counter-clockwise when the two are exactly opposite) and its chroma multiplied by (1 − w) + w × (To chroma ÷ From chroma); its lightness is kept." Add an AC: "Given From #C8281E, To #0050FF, Range 0, Softness 100, when the hue ring is rendered, then in the fade every step's hue lies between its own and the target hue on the shorter arc, and no step's C* falls below the smaller of its input C* and the matched C* by more than 2."

## Major

### M1. Overlapping replacements compound chroma; no AC covers overlap
- `rules.md:46` (*Several replacements*); `F-028-colour-replace.md:51` (edge case "both apply, in list order").
- Problem: weights come from the input, changes apply in order, so a pixel fully matched by #1 and #2 ends at To2's hue with chroma × ratio1 × ratio2 (e.g. 1.5 × 2 = 3, then gamut-cut). The result of #1 is invisible yet its chroma factor leaks. No AC tests overlap, order or the cap.
- Fix (RULE-25): "Each later replacement acts only on the share earlier ones left unmatched: its effective weight is its own weight × (1 − the sum of earlier effective weights), so a pixel's total match never exceeds 1 and a fully matched pixel takes exactly one replacement's change." Edge case line 51: "→ the first in the list wins where both match in full; in their fades the shares add up to at most 1." New AC: "Given replacements 1 (From #C8281E → To #0050FF) and 2 (From #D2501E → To #00A050) at Range 100, when the hue ring is rendered, then the From-1 step reaches To 1's hue and C* within 2 of its single-replacement result, and swapping their order changes only steps where both weights are below 1."

### M2. Range/Softness mapping between the end points is not stated; AC7 cannot be checked "within 1°"
- `rules.md:46` (*Matching*: "from 5° (at 0) to 60° (at 100)", "from 2° (at 0) to as wide as the matched distance (at 100)"); `F-028:40` (AC7).
- Fix: "Range sets the hue distance either side of From's hue matched in full: 5° + 0.55° × Range. Softness sets the further distance over which matching fades out: 2° + (matched distance − 2°) × Softness ÷ 100." (Defaults: 21.5° full, 11.75° fade.) AC7: "... then the full span is 5° + 0.55° × Range either side and the fade 2° + (full − 2°) × Softness ÷ 100 (within 1°) ...".

### M3. Near-grey From colours (C* 2–12) only half-replace, silently
- `rules.md:46` (*Grey From colour*: refused only below C* 2) with RULE-24 grey fade (C* 2 → 12, `rules.md:45`).
- Problem: a dull sky or skin (the Intent's "dull sky") at C* 6–10 has matched pixels at grey-gate weight 0.3–0.8, so they move only partly to To; nothing tells the user. The chroma fade (½ → ¼ of From's) is also below the grey gate, so it does nothing for such From colours.
- Fix (owner choice; recommended): refuse From below C* 12 too, with the same notice reworded, or keep it and add the edge case "From with C* under 12 → matched pixels under C* 12 change only partly (RULE-24 grey fade)" plus an AC with From C* 8 asserting partial change. Recommend the refusal at C* 6 with a softened notice ("That colour is too dull to match well") only if the owner agrees; otherwise document.

### M4. In pick mode the user sees the graded picture but the source is sampled
- `rules.md:46` (*Eyedropper*); `CMP-Preview.md:26`; F-028 Q5 (`F-028:58`).
- Problem: with duotone, a look, or an existing replacement on, the user clicks what looks purple/blue and gets red; the magnifier (ADR §7, same call) would show a colour unlike the preview around it. Wrong design for PER-03.
- Fix (RULE-25 *Eyedropper*, CMP-Preview "picking a colour"): "While pick mode is on, the preview shows the selected clip without adjustments, colour tools and look, as compare does, with the pill COPY-replace.picking; leaving pick mode restores it." Add to AC1: "and the preview shows the clip ungraded until the pick".

### M5. Preview gestures in pick mode are not defined (drag would move the clip)
- `rules.md:46`; RULE-21 *Preview* (`rules.md:42`: "dragging the selected clip ... moves it, and pinching scales it"); `CMP-Preview.md:26` (only "placement handles hidden").
- Fix (RULE-25 *Eyedropper*): "In pick mode, pressing and dragging on the preview never moves or scales the clip; a mouse picks on release over the clip's picture; Play ends pick mode without a change (frame stepping stays available)." Add to AC3: "and the clip's placement is unchanged".

### M6. Grey refusal during Add, and lift/click outside: does pick mode stay on?
- `rules.md:46` ("A click outside the clip's picture does nothing", *Grey From colour*); `F-028:41` (AC8 says "From is not changed", but with Add there is no From).
- Fix: "A grey pick, or a click, tap or lift outside the clip's picture, changes nothing and keeps pick mode on, so the user can pick again; with Add, no replacement is added." AC8: "Given pick mode started by Add colour to replace, when the user clicks a grey wall, then no replacement is added, COPY-notice.replace_grey is shown and pick mode stays on; given pick mode for Colour 1, then its From is unchanged."

### M7. Moving the playhead to the clip's first frame often shows black or a blend
- `rules.md:46` ("moves to the clip's first frame"); `F-028:38` (AC5).
- Problem: with a fade in (Quick fade in is common) or a cross-fade into the clip, the first frame is dark or mixed, so the user can't see what to pick (unless M4 is adopted, which shows the source anyway).
- Fix: if M4 is adopted, keep as is. Otherwise: "moves to the first frame after the clip's fade in or cross-fade ends, or the clip's middle when that is later than its middle", and update AC5.

### M8. AC6 and AC7 fixtures are under-defined
- `F-028:39` (AC6 "From red", "a red ball"), `F-028:40` (AC7 "one replacement", no From/To).
- Problem: AC7 on the ring (C* 30) with a saturated From (pure red, OK C ≈ 0.26) puts every ring step inside the ½ → ¼ chroma fade, so the hue span cannot be measured. AC6's "shaded parts" of a real red ball fall below half the lit chroma and only partly match, so "reach the To colour's hue" fails by design.
- Fix: AC7: "Given the hue ring and one replacement whose From is the ring's step at working-space hue 30° and whose To is the step at 210° ...". AC6: "Given a synthetic red ball (working-space hue within 3° of From, lightness 25 to 85, chroma at least ¾ of From's) on a grey floor (C* < 2), From the ball's lit colour and To #0050FF ... then every ball pixel reaches To's hue and keeps its lightness ...".

## Minor

- **m1** `F-028:30` R6 "reset ... one replacement" has no control (the card has Remove only, `CMP-Inspector.md:23`) and no AC. Drop "one replacement," (Remove covers it).
- **m2** `CMP-Inspector.md:18`: the "changed" condition lists the four 1.2.0 tools only. Add "colour replace with at least one replacement (even with To = From, so its Reset is reachable)".
- **m3** `CMP-ColourPicker.md:20`: a From's Lightness drag to 0 or 100 also passes through grey. Wording: "a Saturation or Lightness drag stops at the last value that is not grey".
- **m4** `rules.md:46` marker: "1 % of the frame" has no axis and no bound. Wording: "moves it by 1 % of the frame's width (Left/Right) or height (Up/Down) (Shift: 10 %), kept within the part of the clip's picture inside the frame; it starts at the centre of that part". Add a value text for screen readers, e.g. new COPY-replace.marker_value "{hex}, {x} %, {y} %", updated as it moves (NFR-06: a blind user otherwise picks with no feedback).
- **m5** `rules.md:46` "outside the clip's picture": say "the clip's placed picture inside the frame; the background (colour or Blur) and text layers do not count; text over the picture is ignored, the clip beneath is sampled". Add "Entering full screen ends pick mode" (the inspector is hidden there).
- **m6** `rules.md:46` "average colour" of the disc: say "averaged in linear light, rounded to #RRGGBB, then tested for grey"; ACs should use flat patches wider than the disc (AC1, AC4) so resolution does not matter.
- **m7** `CMP-Preview.md:26` magnifier: say what it shows: "an enlarged view of the picture around the finger with a centre ring in the colour a lift would pick; it flips below the finger near the preview's top edge". AC3 then checks the ring colour against the sampled value.
- **m8** `rules.md:46` / RULE-24 *History* (`rules.md:45`): add "removing a replacement" to the undo-step list and "picking again sets From only; To is kept" (+ an AC for re-pick).
- **m9** ADR-0017 §7 reads a fixed 33 × 33 region at preview resolution; at `s` above 1600 px of preview the disc (radius 1 % of `s`) exceeds it. Record in MOD-Compositor: "the read region is sized to the disc (2⌈r⌉ + 1)".
- **m10** `F-028:50-55` add edge cases: "Colour pop keeping Red with red replaced by blue → the replaced area turns grey (pop follows replace)"; "the mixer's Red range no longer affects replaced pixels". Also "Apply to all and Paste replace the target clip's list, never merge".
- **m11** `CMP-Inspector.md:23/33`: no 320 px card layout. With From, arrow, To and "Lấy màu từ khung xem" one row does not fit. Wording: "Narrow: From, arrow and To on one row; Pick from preview full width below; Remove as an icon button with its name in the card title row." Let the picking pill wrap to two lines under 400 px.
- **m12** RULE-24 *Quality* bound (`rules.md:45`) lists units for hue, lightness and the grey fade, not for replace's chroma fade (½ → ¼ of From's). Add "per working-space chroma unit for colour replace's chroma fade (width = ¼ of From's chroma)", and say the product rule extends to three fades (sum of three bounds).
- **m13** AC9 `F-028:42` "the same areas are still replaced" → "every pixel's match weight equals its weight without Temperature" (exact, oracle-checkable). AC10 needs the reference phone; record as waived per owner policy, not passed.

Status: fixes
