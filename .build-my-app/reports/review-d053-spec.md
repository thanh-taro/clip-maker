# Spec review: D-053 colour tools (commit cb16ac6)

Read-only review. `python3 tools/spec_lint.py`: **1011 IDs, 4154 references, 0 errors, 0 warnings.**
Numeric checks below were done with a scratch sRGB / OKLab / CIELAB conversion (standard matrices), matching what ADR-0017 proposes.

## Verdicts
| Item | Verdict |
|---|---|
| RULE-24 | not ready (B1, B2, M1, M2, M3) |
| RULE-25 | draft-level; carries B1, B2 and m6 into F-028 |
| F-024 colour mixer | ready after fixes (B2 and M1 change AC1–AC3 wording; behaviour is otherwise sound) |
| F-025 colour pop | not ready (B1: AC3 cannot pass; B2: AC2/AC4 L* bar) |
| F-026 split toning | not ready (B2: AC2 hue; M2: Balance direction and tone weights) |
| F-027 duotone | ready after minor fixes (M4) |
| F-028 colour replace (draft) | stays draft: Q5–Q7 answered by the owner but not recorded; B1/B2 apply to AC6/AC7 |
| CMP-ColourPicker | ready after minor fixes (m3, m9) |
| CMP-Inspector / CMP-Preview changes | ready after minor fixes (m5, m8) |
| ADR-0017 (proposed) | needs updating with whatever B2 settles (where lightness/hue are judged) |
| Schema | backward-compatible (`colourTools` optional, absent = defaults); M4 and m7 only |

Consistency checks that passed: identity at defaults (every tool's default is a no-op, split-toning hues inert at strength 0; RULE-24 Quality bar 1; ADR §6 bit-identical when off); RULE-08/RULE-09 order extended without contradiction; Reset all keeps the look (matches F-007 AC3, which only covers adjustments); Apply to all / Copy / Paste / Compare extended in RULE-24 and reflected in CMP-Inspector, CMP-Preview and COPY-action.copy_look; RULE-23 clears copied colour tools; export = preview via NFR-08 in every feature; keyboard: every slider has a field, choices are radio groups (RULE-20), eyedropper marker keys added to RULE-20; touch: magnifier plus typed or picker colour (RULE-21/NFR-06); every COPY key referenced exists in en-US and vi-VN (lint 0 errors); no tool names outside 40-technical (OKLab, WebGL and `readPixels` appear only in ADR-0017 / MOD-Compositor).

## Blockers

### B1. The "4× the default step" smoothness bar cannot be met by narrow fades, and its reference step is undefined
- `specs/10-domain/rules.md:45` (RULE-24 *Quality*, bullet 3: "At any setting ... no two adjacent steps of the hue ring ... differ by more than four times the largest adjacent difference at default"); `specs/20-features/F-025-colour-pop.md:34` (AC3 "at every Range and Amount"); `specs/20-features/F-028-colour-replace.md:40` (AC7, Softness 0); `specs/20-features/F-024-colour-mixer.md:34` (AC3).
- Problem: the bar ties the allowed step to the hue ring's default step (a 1° hue step, about ΔE00 0.4–0.5 at C* 40). The tools the same rule defines have fades that are, by design, much steeper:
  - Colour pop at Range 0: keeping fades out over 25 % of the Red–Orange gap, about 7° of the ring. Taking C* 40 to 0 over 7 steps gives about ΔC* 6–8 per step, about ΔE00 3–4, which is 6–9× the default step. F-025 AC3 fails at Range 0 and Amount 100 for any implementation.
  - Colour replace at Softness 0: the fade is 2° wide, and in that span the hue jumps from From to To (for example red to blue). That is dozens of ΔE00 in one step.
  - Colour mixer, opposite Lightness on neighbours (Red −100, Orange +100): about 50 L* over the 30° Red–Orange gap, roughly ΔE00 2.6 per step, about 6×. This is allowed by "at any setting", even though F-024 AC3 tests only one-at-a-time and all-at-once.
  - The hue ring's L* and C* are never given (see M1), so "the largest adjacent difference at default" has no value. Every smoothness AC is unmeasurable until they are.
- Fix: replace the hue-ring part of the bullet with a bar on each tool's weight, which the CPU oracle can check exactly, and keep the 4× bar for the grey ramp only. Suggested wording:
  > • At any setting, the full-precision result has no hard edges: every weight a tool uses (a range's weight, colour pop's keep weight, a replacement's match weight, split toning's tone weights) changes continuously with hue or lightness, and across a fade it changes by at most 1.5 ÷ (the fade's width in hue-ring steps) per step. On the grey ramp no two adjacent steps differ by more than four times the largest adjacent difference at default; Split toning keeps lightness in order, and Duotone's output lightness runs in one direction ...
  
  Then F-025 AC3 becomes: "... at every Range and Amount, colour pop's keep weight on the hue ring changes by at most 1.5 ÷ (its fade width in steps) per step, and the kept span grows with Range." Make the same change to F-028 AC7 and to F-024 AC3 (the range weights per step).

### B2. The rules compute in one colour space and the ACs measure in another, so the L* and hue thresholds fail for saturated colours
- `specs/10-domain/rules.md:45` (*Measures*: "lightness, chroma and hue are those of the perceptual colour space fixed in 40-technical. Tests judge results in CIELAB"; *Quality*: "Colour pop and Split toning change a pixel's L* by at most 2"); `specs/10-domain/rules.md:46` (RULE-25 *Change*: "L* within 2"); F-025 AC2 and AC4 (`F-025-colour-pop.md:33,35`); F-026 AC2 (`F-026-split-toning.md:33`); F-024 AC2 (`F-024-colour-mixer.md:33`); F-028 AC6 (`F-028-colour-replace.md:39`); ADR-0017 §2.
- Problem: ADR-0017 keeps OKLab L constant, as RULE-24 asks ("keeping lightness" in the working space). Measured in CIELAB, that same operation moves L* by more than 2:
  - Turning grey at constant OKLab L changes CIELAB L* by +5.1 for #FF00FF, +4.6 for #8000FF, +4.1 for #0000FF, +3.6 for #FF0000, −3.2 for #00FF00, and +2.1 for a chart-like red (#B03A2E). The RULE-24 bar ("Colour pop ... L* at most 2" on the 24-patch chart) fails for colour pop at Amount 100 on saturated patches. F-025 AC2 passes or fails depending on the hue ring's unstated chroma.
  - Hue: the OKLCh and CIELAB hue angles of the same colour differ by up to 42° (#0000FF is 264° in OKLCh and 306° in CIELAB). For F-026 AC2, the hue-wheel 210° colour (#0080FF) has CIELAB hue 285°. The OKLab tint the ADR adds reads as about 273° at L* 20, 12° off, so "within 10°" fails. In F-024 AC2 ("takes the Yellow centre's hue within 3°") and in "the Red centre hue" it is not said which hue is meant.
- Fix (choose one, then align ADR-0017 §2):
  - (a, recommended) Judge *lightness kept* and *hue reached* in the working space, and keep CIELAB for ΔE00, the C* grey test and fidelity. In RULE-24 *Measures*, add: "Lightness kept, hue reached and range centres are judged in the working perceptual space (40-technical) within 0.5 % of its lightness scale and 1° of its hue; ΔE00, C* and the grey test are judged in CIELAB." Then in F-025 AC2, F-026 AC2, F-028 AC6 and RULE-25 replace "L* within 2" with "lightness kept (RULE-24 *Measures*)". In F-026 AC2 replace "within 10° of the hue of the hue wheel's 210° colour" with "at the working-space hue of the hue wheel's 210° colour within 3°".
  - (b) Keep CIELAB but loosen the bars to what the chosen space can meet (for example "L* within 6") and state the hue reference per AC. This is weaker and less useful.

## Majors

### M1. The hue-ring fixture contradicts itself and has no values
- `specs/10-domain/rules.md:45` ("the hue ring: 360 steps around the hue wheel at constant L* and C*").
- Problem: the hue wheel is defined by full-saturation sRGB colours, whose L* and C* vary, so "around the hue wheel at constant L* and C*" can't both hold. No L* or C* is given, and many ACs depend on the ring: F-024 AC1–AC3, F-025 AC2–AC5, F-028 AC7.
- Fix: "*Hue ring:* 360 colours, one per degree of working-space hue, all at CIELAB L* 60 and C* 30 (inside sRGB at every hue). A range's *centre step* is the step nearest that range's working-space centre hue."

### M2. Split toning's Balance is reversed against its own copy and common photo apps, and the tone weights are not defined
- `specs/10-domain/rules.md:45` ("moving to L* 20 at −100 (more of the picture takes the highlights tint) and to L* 80 at +100"); `specs/30-experience/copy.md:382` ("{value} toward shadows" for values below 0); `F-026-split-toning.md:33-34`.
- Problem: −40 is shown as "40 toward shadows", but it gives more of the picture the *highlights* tint. Photo apps do the opposite: a negative balance favours the shadows tint. Separately, the rule never says where a tint's weight is full or how wide the crossover is. Yet F-026 AC2 needs C* ≥ 10 at L* 20 and less than ΔE00 1 above L* 60, so the implementer has to guess the curve.
- Fix: "The two tints cross over at L* 50 at Balance 0, moving to L* 80 at −100 (more of the picture takes the shadows tint) and to L* 20 at +100. Each tint's weight is full from 15 L* inside its side of the crossover and fades to none 15 L* past it; both fade to none within L* 5 of pure black and pure white." Then update F-026 AC3 ("falls from about L* 80 to about L* 20").

### M3. "Each ... choice is one undo step" also covers choosing which mixer range to edit
- `specs/10-domain/rules.md:45` (*History*); `F-024-colour-mixer.md:40` (AC9).
- Problem: read literally, pressing Right on the range choice creates an undo step and changes the project, which is wrong. Whether the shown range is stored, and per clip or per session, is also not said.
- Fix: in *History*, add "Choosing which colour range the mixer shows is not an undo step and is not stored in the clip; it is kept for the session, like open groups." Add to F-024 AC9: "and no undo step exists."

### M4. Duotone state: "the pair chosen last" is lost after None, and Strength on a pair change is undefined
- `specs/10-domain/rules.md:45` ("Custom starts from the pair chosen last on this clip"); `specs/10-domain/project.schema.json:293-330` (`duotone` null = None); `F-027-duotone.md:36`, `:47`.
- Problem: after pair → None → Custom, the schema keeps nothing, so the start colours are undefined. It is also not said whether choosing another pair at Strength 40 keeps 40 or starts at 100 (looks restart at 100, RULE-09). And `pair` is a free string while also storing hex values that looks.md says "may be tuned", so it is unclear which one wins.
- Fix: in RULE-24 *Duotone*, add "Choosing a pair starts Strength at 100. None keeps the last pair and colours for Custom." In the schema, keep the `duotone` object while off (add `"on": boolean` or `pair: "none"`), make `pair` an enum of the six ids plus `custom`, and add "for a built-in pair, the stored colours are that pair's (looks.md)".

## Minors

- **m1.** `F-028-colour-replace.md:58-60`: Q5–Q7 are still `[ ]`, but the owner has accepted (source sampling; To = From; Range 30 / Softness 50). Tick them and record "Owner confirmed (D-053)". The F-024–F-027 open-question lines (`F-024:52`, `F-025:51`, `F-026:50`, `F-027:50`) still say "Owner to confirm"; change them to "Confirmed by owner (D-053)".
- **m2.** `specs/50-quality/nfr.md:9` (NFR-03) and F-024 AC6 etc.: the load includes "three colour replacements", which don't exist in 1.2.0, so NFR-03 can't be measured for that release. Wording: "every colour tool the build has (RULE-24, RULE-25: ...)".
- **m3.** `specs/30-experience/copy.md:404` COPY-picker.hex_invalid "Use six hex digits" contradicts CMP-ColourPicker, which accepts `#RGB`. Wording: "Use a hex code like #3A7BD5 or #39F." / "Dùng mã hex như #3A7BD5 hoặc #39F."
- **m4.** `F-026-split-toning.md:39` and COPY-colour_tools.hue_value: "nearest colour range" doesn't say which scale, and the default 210° is exactly halfway between Aqua (180°) and Blue (240°) on the hue wheel. Add to RULE-24: "On the hue wheel the range centres are Red 0°, Orange 30°, Yellow 60°, Green 120°, Aqua 180°, Blue 240°, Purple 270°, Magenta 300°; a hue halfway between two takes the later one", so 210° reads "Blue".
- **m5.** `CMP-Inspector.md:18`: the group Reset sits inside a header that "is a disclosure button". A button nested in a button breaks the NFR-06 zero-violation automated check. Wording: "... a separate group Reset button after the header button (not inside it) ...".
- **m6.** `rules.md:46` RULE-25 "Pixels with less than a quarter of the From colour's chroma ... never match" is a hard chroma edge, which goes against "no hard edges". ADR §5 already smooths it. Wording: "matching fades out as a pixel's chroma falls from half to a quarter of the From colour's".
- **m7.** `CMP-ColourPicker.md:19` (refused state): dragging Saturation toward 0 for a From colour passes through grey live. "The colour reverts" would make the swatch jump. Wording: "a Saturation drag for a From colour stops at the lowest non-grey value, with COPY-notice.replace_grey; a typed or preset grey is refused and the colour reverts".
- **m8.** Vocabulary: "None" (rules, features) and "Off" (COPY-pop.none, COPY-duotone.none, CMP-Inspector "unavailable while Off") name the same state. Use "None" in the specs and keep "Off" only as visible copy, or rename the copy keys' note. "pick mode", "hue wheel" and "hue ring" are used across files but are not in `glossary.md`. Add them.
- **m9.** 320 px phone (NFR-07): collapsed groups keep the Adjust sheet navigable, but Effects now sits below five more headers (about 220 px), and CMP-ColourPicker fills a sheet body of about 230 px (60 % rule at under 640 px tall, minus title and footer). It needs about 450 px, so it scrolls about twice per colour. Suggestions: order the colour-tool groups after Effects, or keep them before Effects and add the narrow-sheet note "Effects stays directly reachable: the colour-tool headers sit under one 'Colour tools' sub-heading". Give the narrow picker a fixed top part (before/after swatch plus hex) with presets as one scrolling row of ten.
- **m10.** `rules.md:41` RULE-20 Mod+C/Mod+V still says "a clip's adjustments and look", and F-007.R7 / UX notes still say compare shows the clip "without adjustments and look". RULE-24 does extend them, but a reader of RULE-20 or F-007 alone gets it wrong. Append "(and colour tools, RULE-24)" in both places.
- **m11.** ADR-0017 is `proposed` and conditional on spike SP-colour-tools, while F-024–F-027 are `ready`. The roadmap says the spike runs before F-024 is built. Make it explicit in M-4: "Building starts once ADR-0017 is accepted after SP-colour-tools."

---

# Round 2 (commit c3232f9)

Lint: **1011 IDs, 4190 references, 0 errors, 0 warnings.** I reran the scratch checks (sRGB / OKLab / CIELAB / ΔE00) against the new RULE-24 text and ADR-0017. The results are below.

## Round-1 findings
| ID | Result | Evidence |
|---|---|---|
| B1 smoothness bar | **Resolved** for hue (weight bound of 1.5 ÷ width per step; a smoothstep's steepest slope is exactly 1.5 ÷ width, so it is met). F-025 AC3, F-028 AC7 and F-024 AC3 now test weights. The raised cosine is gone from the ADR (it would have exceeded the bound: π/2 > 1.5). | rules.md:45, ADR §3, §5 |
| B2 measuring space | **Resolved.** Lightness kept and hue reached are judged in the working space (0.5 / 1°). F-025 AC2/AC4, F-026 AC2 and F-028 AC6 were reworded. Rechecked: F-025 AC4 (half chroma) gives C* within 5.6 % of 15 on the whole ring, within the 10 % limit. | rules.md:45 |
| M1 hue ring | **Resolved.** CIELAB L* 60, C* 30 per OKLCh degree is inside sRGB at every hue (0 of 3,600 samples out of gamut). | rules.md:45, ADR §2 |
| M2 split-toning Balance and weights | **Resolved** for direction and crossover. Weights are now defined. **New issue in its black/white fade, see N1.** | rules.md:45, F-026 AC2/AC3 |
| M3 undo scope | **Resolved.** The range shown is not stored and not an undo step, and F-024 AC9 checks this. | rules.md:45 |
| M4 duotone state | **Resolved:** `on` flag, `pair` enum, Strength restarts at 100, Custom starts from the last colours. F-027 AC1/AC5 cover it. | schema:293-330 |
| m1–m11 | Spot-checked; all resolved: Q-lines recorded; NFR-03 says "the build has"; hex copy; 210° reads Blue; Reset is outside the disclosure button; chroma floor fades from ½ to ¼; picker grey drag stops; None/Off noted; glossary gains Hue wheel, Hue ring and Pick mode; colour-tool groups moved after Effects and the narrow picker has a fixed top; RULE-20 and F-007 include colour tools; roadmap gates building on ADR-0017. | |

## New findings

### N1 (blocker for F-026). Split toning fails the 4× grey-ramp bar near black for blue–purple shadow hues
- `rules.md:45` (*Split toning*: "both fade smoothly to none within 5 of black (0) and white (100)"); F-026 AC3 ("no two adjacent steps differ by more than four times ..."); ADR-0017 §4.
- Problem: the first 8-bit grey step above black already sits at working-space lightness 6.7, so a fade of 5 has ended by the second step. At Strength 100 the jump from black (step 0) to step 1 is ΔE00 3.4–4.0. The default ramp's largest step is ΔE00 0.398, so that is **8–10× for OKLCh hues 264°–280°** (hue-wheel blue to purple, roughly 240°–255°). The default 210° gives 1.5×. Widening the fade (scan over hues, Balance 0 and the extremes, Strength 100): a fade width of 5 gives 9.9×, 10 gives 7.7×, 15 gives 4.3×, **20 gives 2.7×** and 25 gives 2.1×.
- Fix: in RULE-24 *Split toning*, use "both fade smoothly to none within 20 of black (0) and white (100)", and in ADR §4 use "smoothsteps to none within 0.20 of L 0 and L 1". F-026 AC2 still holds (lightness 20 is full weight). With Balance +100, the shadows tint then shows mainly between 5 and 20; that is acceptable.

### N2 (blocker for F-027). Every built-in duotone pair fails the 4× grey-ramp bar at the first step
- `rules.md:45` (*Duotone*: "Each pixel's lightness picks a colour ..."); F-027 AC2; ADR-0017 §4 ("maps the incoming OKLab L through the input's own range [0, 1]").
- Problem: this was present in round 1, and I missed it then. With the gradient position equal to OKLab L, step 0 to step 1 moves 6.7 % along the gradient. The output's dark end sits where CIELAB is sensitive, so ΔE00 is 2.8–5.5, which is **7.1× (Indigo & Pink) to 13.7× (Ink & Coral)**. All six pairs fail F-027 AC2.
- Fix: place pixels on the gradient by an even-step lightness instead. Measured ratios: by CIELAB L* ÷ 100 of the incoming pixel, 0.6–1.0× for all six; by the encoded grey value, 0.6–0.9×. Rule wording: "Each pixel's position on the gradient is its CIELAB L* ÷ 100 (0 at black, 1 at white); the gradient itself is blended in the perceptual space." ADR §4: "Duotone's gradient position is L* ÷ 100 computed from the pixel's relative luminance (Y = L_ok³ → L*), not OKLab L."

### N3 (minor). The grey fade is listed under the per-step bound but has no unit, and the ADR's gate edges slightly miss the rule
- `rules.md:45` ("... the grey fade ... width in hue-ring steps, or in lightness units") and ADR §2 (smoothstep on OKLCh C from 0.006 to 0.03).
- Problem: the grey fade runs over chroma, so neither unit applies. Measured over all hues at L* 20, 50 and 80: C* 2 maps to OK C 0.0052–0.0061, and C* 12 maps to 0.0298–0.0388. So 0.006 gives a weight slightly above 0 at C* 2 for some hues, and the ADR's property test ("every sRGB colour with C* < 2 gets weight 0") fails strictly. 0.03 also gives a weight slightly below 1 at C* 12. Per C*, the gate's slope reaches about 0.19 against the 0.15 bound.
- Fix: in the rule, use "(the fade's width in hue-ring steps, in lightness units, or for the grey fade in working-space chroma units)". In the ADR, set the gate to 0.0065–0.029 and state its bound in OK C.

### N4 (minor). "per step" with "lightness units" is ambiguous
- Problem: grey-ramp steps are about 0.4 lightness units each, so the per-step bound can be read two ways.
- Fix: "changes by at most 1.5 ÷ (the fade's width) per hue-ring step, or per lightness unit".

### N5 (minor). It is unclear whether Reset of duotone clears the remembered colours
- `rules.md:45`; F-027 AC8.
- Fix: add "A duotone Reset (or Reset all) also forgets the remembered colours; Custom then starts from Midnight & Peach."

## Verdicts after round 2
| Item | Verdict |
|---|---|
| F-024 colour mixer | **ready** |
| F-025 colour pop | **ready** |
| F-026 split toning | **not ready** (N1, a one-number fix in RULE-24 and ADR §4) |
| F-027 duotone | **not ready** (N2, a one-sentence fix in RULE-24 and ADR §4) |
| F-028 | stays draft (M-5); its Q5–Q7 are recorded and nothing blocks moving it to ready except N3/N4 wording |
| RULE-24 / ADR-0017 | fix N1–N4 |
