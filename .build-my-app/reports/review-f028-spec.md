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

---

# Round 2 (commit c35fe0c)

Lint: **1022 IDs, 4265 references, 0 errors, 0 warnings.** Scratch checks rerun (OKLab/OKLCh, smoothstep weights, sRGB gamut) in a throwaway script; numbers below.

## Round-1 findings
| ID | Result | Evidence |
|---|---|---|
| B1 blend | **Partly resolved, but the fix adds a hard edge (N1).** The blend is now defined (hue moved w of the way, chroma × (1 − w) + w × ratio). The *direction* is chosen per pixel, which is discontinuous. | rules.md:46 *Change*; F-028:48 AC13; ADR-0017:66 |
| M1 overlap | **Resolved.** Effective weight w_k × (1 − Σ earlier) caps the total at 1; a full first match takes only the first's change. The rewritten AC14 claim ("swapping the two changes only steps that both match") is **correct**: if either weight is 0, both effective weights and the order of the changes that apply are the same after a swap (this also holds with three replacements). "Both match" must mean both weights above 0, fades included. | rules.md:46; F-028 AC14 |
| M2 mappings | **Resolved.** Linear formulas are in RULE-25, ADR and AC7. "Within 1°" is reachable on a 1° ring: floor(full + fade) − floor(full) is within 1 of fade. The ring's OK C varies under 2× across hue, so every step stays at chroma weight 1 against From at 30°. | rules.md:46; F-028 AC7 |
| M3 faint | **Resolved.** C* 2–12 is accepted with COPY-notice.replace_faint (copy exists in en/vi). It agrees with the grey gate. AC15 is exact: a C* 8 patch picked as its own From has weight smoothstep(0.6) = 0.648. | rules.md:46; F-028 AC15; CMP-ColourPicker:20 |
| M4 ungraded pick preview | **Resolved.** | rules.md:46 *Pick mode*; CMP-Preview:26; ADR amendment |
| M5 gestures and Play | **Resolved** (AC16). | |
| M6 grey/outside keeps pick mode | **Resolved** (AC8, RULE-25 *Picking*). | |
| M7 frame after fade in or cross-fade | **Resolved** (AC5). See n2 for one edge. | |
| M8 fixtures | **AC7 and flat patches resolved. The ball fixture can't be built (N2).** | F-028:35 |
| m1–m13 | Spot-checked; all resolved (R6, changed mark, Lightness drag, marker axis/bounds/value text, outside/Blur/text/full screen, linear-light average, magnifier, undo of removal and re-pick, ADR read region, pop/mixer and paste edge cases, 320 px card, chroma-fade unit, AC9 by weights, AC10 waived). | |

## New findings

### N1 (blocker). Choosing the "shorter way" per pixel makes a hard edge whenever To is roughly opposite From
- `specs/10-domain/rules.md:46` (*Change*: "moved *w* of the way to the To colour's hue along the shorter way round the hue circle (the way of increasing hue when the two are exactly opposite)"); `F-028-colour-replace.md:48` (AC13: "each fade side turns the shorter way from its own hue"); `ADR-0017:66` amendment.
- Problem: the shorter way flips for the input hue exactly opposite To's. When that hue falls in the fade (0 < w < 1), neighbouring pixels turn opposite ways. At the **defaults** (Range 30, Softness 50), From 30° and To 185° (red jacket to cyan) give a jump of **77° in output hue between inputs 0.01° apart** (at input hue 5°, w 0.79). On the 1° ring the jump is 97°, which is ΔE00 in the tens at C* 30. From 30° and To 250° at Range 30, Softness 100 jumps 27°. The weight bound still passes, because it bounds weights, not output, so no AC catches this. RULE-24's "no hard edges" is broken in the output. The tie rule only covers the exact-opposite case. That case happens to be safe, because there the flip point is From's own hue, where w = 1.
- Fix: take the direction once per replacement, from From to To, and unwrap each pixel against From. RULE-25 *Change*: "a pixel with match weight *w* has its hue turned *w* of the way to the To colour's hue, going round the same way as from the From colour's hue to the To colour's by the shorter way (increasing hue when they are exactly opposite); a pixel's own distance from From's hue is counted on its side of From, so pixels near From turn by nearly the same angle." Formula for the ADR: h' = h + w × (Δ − d), where Δ = the shorter signed angle From → To (+180° on a tie) and d = the signed angle From → h (|d| ≤ 120° wherever w > 0). At w = 1 this gives To's hue exactly. At the same defaults the largest jump at 0.01° sampling is **0.24°**, so the output is continuous. AC13: "... every fade step's hue turns from its own hue in the direction From → To (decreasing for To 250°; increasing for To 210°, exactly opposite), and between adjacent fade steps the output hue changes by at most (Δ − d) × the weight bound + 1°." Add a case that would have caught this: "From the ring step at 30°, To the step at 185°, Range 30, Softness 50: no two adjacent ring steps differ in output hue by more than 25°." The per-replacement rule gives at most 23.7° there; the per-pixel rule gives 97°.

### N2 (major). The ball fixture is outside sRGB for most of its lightness span
- `F-028-colour-replace.md:35` ("lightness from 25 to 85 and chroma at least ¾ of #C8281E's"); AC6 (`:41`).
- Problem: #C8281E is OKLCh (0.541, 0.197, 29.1°), so ¾ of its chroma is OK C 0.148. Within ±3° of its hue, the most sRGB can show is C 0.095 at lightness 25, 0.132 at 35, 0.114 at 80 and 0.082 at 85. The fixture holds only from about **lightness 40 to 75**.
- Fix: "lightness from 40 to 75 (working space)". If the shaded part should go darker, use "lightness 25 to 85, and chroma at least ¾ of #C8281E's or the most sRGB can show at that lightness and hue, whichever is less, but never below ½ of #C8281E's". That second option still fails below about 30 and above about 82, so 40–75 is the simple choice.

### n1 (minor). ADR-0017 is accepted and marked immutable, yet it was amended in place
- `ADR-0017:66`, `:82`. This follows the file's own precedent ("Outcome", "Where the code differs"), but the footer says "Write a new ADR to change a decision." Either accept it as the project's addendum convention (record that in specs/README) or move the two amendments to a short ADR-0018 that refines ADR-0017 §5/§7.

### n2 (minor). The start frame can fall past the clip's end
- `rules.md:46` *Pick mode* ("the clip's first frame at or after the end of its fade in and of any cross-fade into it"). A fade in plus an incoming cross-fade can cover the whole clip. Add: "or the clip's last frame if that is later".

### n3 (minor). The Blur background in pick mode is undefined
- `rules.md:46`, `CMP-Preview.md:26` ("over the background"). Blur normally shows the clip's adjustments and look (RULE-04). Say "over the background, a Blur background also ungraded" (or "graded as usual").

## Verdicts after round 2
| Item | Verdict |
|---|---|
| F-028 | **not ready** (N1 blocker, N2). Its front matter already says `status: ready` (`F-028:4`); set it back to `draft` or fix N1/N2 before building |
| RULE-25 | not ready (N1); ready once the direction wording changes |
| CMP-Preview / CMP-Inspector / CMP-ColourPicker / copy | ready (n3 is wording) |
| ADR-0017 amendments | fix the formula with N1; settle n1 |

Status: fixes

---

# Round 3 (commit 764cad7), narrow: N1, N2, n1–n3

Lint: **1022 IDs, 4270 references, 0 errors, 0 warnings.**

| ID | Result |
|---|---|
| N1 | **Resolved.** RULE-25 *Change* (`rules.md:46`) now uses one turning direction per replacement. "Its own distance from From's hue being counted on its side of From" is h' = h + w × (Δ − d), as in the ADR-0017 Amendment. Full matches land on To. The tie goes to increasing hue. |
| AC13 bound (25°) | **Right and tight, not loose.** Scratch rerun on the 1° ring (From 30°, To 185°, Range 30, Softness 50): the fixed-direction formula's largest adjacent-step output-hue difference is **23.75°** (steps 2°→3°, on the far side of From where Δ − d ≈ 182°). The per-pixel rule gives **97.05°**. The analytic peak slope is 1 − w + 1.5 × (Δ − d) ÷ fade ≈ 0.5 + 1.5 × 182.4 ÷ 11.75 = **23.8° per 1°**. My round-2 "0.24°" was per 0.01° of input, the same slope. 25° leaves about 5 % margin over the correct result and is about 4× below the bug. Keep 25°; no change needed. |
| N2 | **Resolved.** The ball is now lightness 40 to 75 (`F-028:35`, ADR Amendment), the span where C ≥ 0.148 fits within ±3° of #C8281E's hue. |
| n1 | **Accepted.** The changes are now one labelled "Amendment" section that refines §5/§7 without changing the decision, following the file's own Outcome precedent. |
| n2 | **Resolved** ("or to the clip's last frame if that is earlier"). |
| n3 | **Resolved.** A Blur background is built from the ungraded source (RULE-25, CMP-Preview, ADR). |

## Verdict
F-028: **ready**. RULE-25: **ready**. No remaining findings.

Status: pass
