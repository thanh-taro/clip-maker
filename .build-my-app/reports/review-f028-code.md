# F-028 code review (branch worktree-agent-aef0c24b74c7cc705, d88b7f9)

Scope: `git diff main...worktree-agent-aef0c24b74c7cc705` against F-028, RULE-25 (incl. b1d798a), RULE-24, ADR-0017 + 2026-11-26 Amendment, CMP-Preview / CMP-ColourPicker / CMP-Inspector.
Unit/property tests run (bma_heavy, 1 worker): 5 files, 183 passed. No e2e run. `spec_lint --coverage`: every F-028 AC has a named test.

Verified OK: To = From skip (`replaceParams` returns null and is filtered before the shares, so it takes no share); grey-From params skipped; Δ = shorter signed angle with +180 at exact opposite (hueDelta in (−180, 180]); h' = h + w(Δ − d) with d signed from From on the input hue; grey To keeps hue, ratio 0; chroma fade smoothstep(¼C, ½C) in OKLCh, CIELAB grey gate; L kept, gamutLab after; GPU `replaceC` mirrors CPU `replaceLab` line for line; colour replace is step 1 before WB on both. Grey/faint classification (C* < 2 / < 12). Disc: radius 1 % of min(W,H), read side 2⌈r⌉+1, linear-light mean over pixel centres inside the disc and the placed quad, encode, round. pickPlan: only the clip, ungraded, opacity/weight 1, no text; Blur therefore from the ungraded source. pickStartFrame matches RULE-25 (fade in, cross-fade, last-frame clamp). Pick ends on Play, selection change, playhead leaving the clip, full screen, editor lock (export), Esc/Cancel. Reset all / group Reset / Apply to all / Paste replace the whole list.

## Major

1. **Several replacements: combination differs from the rule's wording** — `src/core/colour.ts:496-514` (CPU) and `src/compositor/grade.ts:421-441` (GPU, `C *= 1.0 + dc` at 439).
   Implementation is a share mixture: h' = h + Σ w_k(Δ_k − d_k), C' = C × (1 + Σ w_k(ratio_k − 1)). RULE-25 says "Changes apply in list order, each with its effective weight", which read literally is sequential: C' = C × Π((1 − w_k) + w_k·ratio_k). They differ by w1·w2·(r1−1)(r2−1) (plus cross terms with 3). Scenario: a pixel with effective weights 0.5/0.5, both To grey: code gives C' = 0, sequential gives 0.25·C. Under the code's model "list order" has no effect beyond the weights, so the spec sentence is vacuous. GPU and CPU agree, AC14 passes either way.
   Fix: decide one. Recommended (coherent with "total never exceeds 1"): amend RULE-25 *Several replacements* and the ADR-0017 Amendment to state the combined formula explicitly (spec change via the spec owner). Otherwise switch both CPU and GLSL to the per-replacement product for chroma.

2. **GPU parity never exercises overlapping replacements** — `tests/e2e/colour-tools.spec.ts:125-129`.
   The three REPLACE entries have disjoint reach on the ring (red ±33° around ~29°, green ~71°–209°, blue ±14° around ~265°), so no pixel has two non-zero weights; the shader's `(1.0 - sum)` share and Σ combination are never compared with the CPU oracle. AC14's assertions are CPU-only.
   Fix: add an overlapping set (AC14's pair: 30°→210° and 50°→150°, Range 100) to REPLACE_SETS on the ring chart.

## Minor

3. **Marker value announces the previous spot's colour** — `src/app/PickOverlay.tsx:84-99, 227, 260`. On an arrow press `mark` changes at once but `markHex` keeps the old colour until a sample 50 ms later, so aria-valuetext reads "old hex, new x %, new y %" (AC4's COPY-replace.marker_value). Fix: clear `markHex` when the marker moves (reads "…"), or sample first and set position and hex together.

4. **Focus lost after the third Add** — `src/app/pick.ts:62-66` with `src/app/ColourTools.tsx:447-451`. Picking the third replacement returns focus to Add, which is now disabled, so `focus()` is a no-op and focus falls to the body. Fix: when Add is full after the pick, return focus to the new card's Pick from preview (or From) button.

5. **Shader variant growth** — `src/compositor/grade.ts:473-486`, `src/compositor/compositor.ts:457-469` (comment still says "at most 16"). The replacement count in bits 4-5 gives up to 64 grade programs, and every count change while editing (first To change, Remove, a To set back to From) compiles a new program synchronously. Simpler: one CT_REP bit and a fixed loop of 3 with unused slots padded so their weight is 0 (e.g. cLo = cHi = 1e9): at most 32 programs, no per-count compile. At least fix the comment and note the count in ADR-0017 §9.

6. **Look preview not suppressed in pick mode** — `src/engine/engine.ts:591-597`. `lookPreview` is still passed while picking, so a live look preview on the clip would grade the pick picture and the sample. Fix: `lookPreview: picking ? null : this.lookPreview`.

7. **Magnifier off-centre near the frame edge** — `src/compositor/compositor.ts:707-712` clamps the read block inside the target; `PickOverlay.tsx:146` draws it unshifted and ignores `s.x/s.y`, so near an edge the centre ring is not over the finger's point. Fix: draw the block offset by (side/2 − s.x, side/2 − s.y), or pad with transparent pixels.

8. **"Picked" announced when nothing changed; faint hint lost on a same-colour re-pick** — `src/app/pick.ts:84-93`, `src/project/ops.ts:837`. If the target replacement no longer exists (e.g. undo during pick mode for Colour 2), `setReplacement` is a no-op yet COPY-replace.picked is announced and pick mode ends. Re-picking the same faint From shows no COPY-notice.replace_faint, though RULE-25 says once per pick. Fix: only announce when the project changed (end pick mode either way); return the faint notice from `setReplacement` regardless of change.

9. **Duplication with 1.2.0 colour code** — `src/compositor/draw.ts:265-269` re-implements `srgbToLinear` and `linearToSrgb` (core/colour.ts:15-16); `src/engine/engine.ts:629-636` re-implements the app's `rgbHex` (app/colour-tools.ts:438), so move `rgbHex` to MOD-Core and use it in both; `replaceLab` (colour.ts:505-507) inlines `replaceOwnWeight`'s formula, so call the function instead.

Status: fixes
