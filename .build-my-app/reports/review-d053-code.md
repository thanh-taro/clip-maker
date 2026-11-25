# Review: D-053 colour tools code (F-024..F-027), release 1.2.0

Scope: the engine on main (`a602a2e..1ac45fb`) and the UI on `worktree-agent-a048a58885e593eb6` (ca9871b).
Checked against RULE-24, ADR-0017 (accepted, with the spike outcome), F-024..F-027, CMP-ColourPicker and CMP-Inspector.
I ran the four colour unit and property files through bma_heavy: 59/59 pass. `spec_lint` reports 0 errors, and every AC of F-024..F-027 has a test.
I did not run e2e (memory budget).

## What checks out
- **Maths matches RULE-24.**
  - The order applied is right: mixer and pop come after Saturation/Vibrance and before the look; split toning and duotone come after the look and before Fade.
  - Every tool at default gives a null stage and program 0, so the output is bit-identical. The e2e test asserts this.
  - The grey gate is a smoothstep on CIELAB C* from 2 to 12, on both CPU and GPU.
  - Range weights are a smoothstep and its complement, so they sum to 1. Mixer hue ±100 lands on the next or previous centre.
  - Pop: the keep zone runs from 25 % to 100 % of the gap, with a further 25 % fade. Loss = Amount × (1 − keep) × gate.
  - Split toning: crossover = 0.5 − 0.3·Balance/100 (−100 gives 0.80). The ±0.15 crossover fade and the 0.20 edge fades are right.
  - Duotone: position = CIELAB L*/100 from Y, mixed in OKLab, with Strength mixed in sRGB. Strength 0 or None gives a null stage.
- **Hue table.** The texel-centre offset and REPEAT wrap match `sampleHueTable`. The RGBA16F/LINEAR texture is valid in WebGL2. The LRU of 6 textures plus the memo of 16 tables is bounded. After a context loss the tables re-upload lazily, and `dispose` loses the context.
- **Project ops.** Values are normalised, so a drag back to the start leaves no undo step.
  - Reset all also clears the colour tools, keeps the look and forgets the remembered duotone colours.
  - Apply to all is one step and carries the tools; Copy/Paste carry them; compare uses NEUTRAL.
  - Custom starts from the last colours shown (Midnight & Peach on a clip that never had a duotone). Choosing None keeps Range/Amount and the duotone colours.
  - Old projects without `colourTools` are unchanged.
- **UI.**
  - A slider movement is one step (`beginGesture`, measured from where it began) with the detent on bipolar sliders. The mixer range choice is session state, not an undo step.
  - Radio groups move focus with the arrow keys, Home and End.
  - The picker gets focus on the hue slider when it opens. Esc and Done return focus to the colour button. Esc in the capture phase leaves the sheet open.
  - Hex accepts `#RGB` and `#RRGGBB`, with or without `#`. Invalid hex is announced.
  - The vi-VN screenshots show no overflow at 320 px.

## Major (2)

### M1. GLSL `atan(0, 0)` on zero-chroma pixels: NaN risk in the mixer and colour-pop shaders
`src/compositor/grade.ts:361` (GLSL `mixPop`): `h = atan(lab.z, lab.y) / TAU` runs for every pixel, including pure black, where OKLab a = b = 0.
GLSL ES 3.00 §8.1 leaves `atan(y, x)` undefined when x and y are both 0.
Some mobile GPU compilers can return NaN there. If they do, the result stays NaN even though the gate g is 0, because 0 × NaN = NaN:
- With the mixer on: `h += g*e.r` keeps NaN, then `C*cos(h*TAU)` gives NaN for the black pixels.
- With only pop on: `lab.yz *= 1.0 - g*hueAt(h).a` gives NaN for the same pixels.

The result is garbage in the darkest parts of the picture on the phone. Desktop ANGLE and SwiftShader return 0 here, so the e2e tests cannot see it.

**Fix:** after `g = greyGate(lin)`, add `if (g <= 0.0) return c;`. Every grey pixel then skips the OKLab round trip, which is exact and also cheaper.
- Mirror it on the CPU in `src/core/colour.ts:283` (`mixPopLab`: if `g0 === 0 && (!mixOn || ...)` return `lab`). Simplest: early-return when `g0 === 0`, since mix and pop both need g > 0.
- Or guard the hue with `atan(lab.z, lab.y + 1e-20)`.

### M2. The only GPU-vs-CPU check runs one of the 15 shader variants, and duotone at 60 % hides the earlier stages
`tests/e2e/colour-tools.spec.ts:46-55` and `:79-95`: the only test that compares the GPU paint with the CPU oracle within ΔE00 1 (ADR-0017 §8) uses ALL_TOOLS.
- That compiles only variant `CT_MIX|CT_POP|CT_SPLIT|CT_DUO`.
- ALL_TOOLS includes duotone at Strength 60, which replaces 60 % of each pixel with a gradient that depends only on L*. Hue and chroma errors from the mixer, pop and split toning are therefore cut to 40 % before ΔE is measured.
- The shipped variants have their own GLSL paths that never get a precision check: mixer-only returns early (`#if !CT_POP`), and pop-only computes `g` and `h` from the input.

The UI e2e tests do use single tools, but only with `near(…, 8)` pixel tolerances.

**Fix:** run the §8 paint test for each of these sets: `{mixer}`, `{pop}`, `{mixer, pop}`, `{split}`, `{duotone}`, and all tools with duotone at Strength 0 or off (at minimum the four single-tool sets plus all-on without duotone).
- Cite F-024.R3, F-025.R3, F-026.R3 and F-027.R4 together with RULE-24/ADR-0017 §8.
- Run the `ring` chart at least, which is cheap.

## Minor (6)

### m1. Duotone Strength's per-row Reset does nothing while None is chosen
`src/app/ToolSlider.tsx:106` shows Reset whenever the row is changed, even when it is disabled. Repro:
1. Choose a pair.
2. Set Strength to 40.
3. Choose None.

The disabled Strength row still shows 40 with a Reset. Clicking it calls `setDuotone`, which returns unchanged when `!cur.on` (`src/project/ops.ts:757`). Its `slider.focus()` also targets a disabled input, so focus drops to the body.

**Fix:** pass `reset` only when the row is not disabled (`ColourTools.tsx` ToolRow: `reset={disabled ? undefined : …}`), or hide Reset in ToolSlider when `disabled`.

### m2. An invalid hex shows the old valid value but is still marked invalid
`src/app/ColourPicker.tsx:97,198`: on an invalid entry `commitHex` sets the draft to null, so the field reverts to the last valid hex. It still has `aria-invalid="true"` and the error text, so a valid-looking value is announced as invalid and the user's typed text is lost.

CMP-ColourPicker "hex invalid" means the field is invalid while the colour keeps its last valid value.

**Fix:** on an invalid entry keep `draft` (the typed text) and set invalid. Clear both on the next valid commit or on input.

### m3. The picker stays open when it is hidden
`pickerOpen` is cleared only on a selection change, an undo, or leaving Custom (`src/app/colour-tools.ts:293-299`).
- Wide: collapsing the Duotone group, or switching to another inspector tab and back, unmounts the popover and then mounts it again. The "before" swatch then resets to the current colour, which breaks the before/after compare.
- Narrow: closing and reopening the Adjust sheet brings back the picker instead of the body.

**Fix:** call `closePicker(false)` when the duotone body or AdjustSection unmounts (a `useEffect` cleanup in `DuotoneBody`), and on `toggleTool('duotone')`.

### m4. Grade variants compile on first use
`src/compositor/compositor.ts:444` compiles a variant synchronously the first time it is painted. That costs tens of ms once, on the frame where a tool first turns on (including during playback) and on the first export frame of a project with tools.

**Fix:** low cost: after init, warm the 15 variants at idle (with KHR_parallel_shader_compile where available), or at least warm the variant of each clip in the project when it loads.

### m5. ADR and module boundary text does not match the code
ADR-0017 §1, §3 and Consequences (`specs/40-technical/adr/ADR-0017-colour-tools-in-the-grade-pass.md:24,43,113`) say MOD-Plan puts the parameters in the frame plan and builds the hue table. The code builds them in MOD-Compositor (`src/compositor/grade.ts:97-140`, `hueStage`, `splitStage`, `duotoneStage`, called from `drawList`), which is how the RULE-08 uniforms already work. The ADR's description of §2's OK-chroma gate and §6's "enabled uniform" are also superseded by the Outcome section.

**Fix:** amend ADR-0017 §1, §3 and Consequences, and MOD-Plan/MOD-Compositor, to say the compositor derives the stages from `clip.colourTools`. Code stays as is.

### m6. Dead code and needless duplication
- `FS_GRADE` (`src/compositor/shaders.ts:34`) has no users now that the code calls `fsGrade(n)`.
- `isDuotonePair` (`src/core/colour-tools.ts:156`) has no users.
- In GLSL `mixPop`, the store `C = length(lab.yz);` (`grade.ts:373`) is dead, and `L` and `C` are unused in the pop-only variant.
- `hueTexture` saves and restores `ACTIVE_TEXTURE` (`compositor.ts:463-465`) although `makeHue` never changes it.
- `hueRange` (`colour-tools.ts:270`) is only an alias for `nearestRange`.
- `RadioSet` (`src/app/ColourTools.tsx:123-190`) re-implements the roving radio group of `OptionGroup.tsx` (which already has `content`, `labelledBy`, swatches, arrows and wrap).

**Fix:** delete the unused items. Add `describedBy`, Home/End and a per-option `changed` flag to OptionGroup and use it here, keeping one radio-group implementation (RULE-20 behaviour in one place).

Status: fixes
