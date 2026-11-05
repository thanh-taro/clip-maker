# Review — wave 0 unit E1 (MOD-Core, MOD-Project, MOD-Plan)
Commit 6d86729 (merge 3566e72). Scope: src/core, src/project, src/plan, tests/unit, tests/property.
Known open questions in build-spec-questions.md are not repeated.

Counts: 4 bugs / spec mismatches (2 medium, 2 low), 3 low spec gaps, 1 boundary deviation, 3 test gaps, 3 maintainability notes.
Scenarios marked "probed" were run against the code.

## Bugs and spec mismatches

1. **Medium — shortening trim near the limit cuts the clip shorter than asked.** `src/project/ops.ts:120-129` (`commitLength`).
   Scenario (probed, 30 fps): A is 0.2 s (6 frames) with a 0.1 s cross-fade into B (599.9 s), and the project is exactly 600 s. `setClipOut(A, 5 frames)` makes the cross-fade drop below 0.1 s, so it is removed (+3 frames) and the project goes over the limit. `fitClipFrames` then shrinks A to **3 frames**, with `length_limited`.
   RULE-03 says a trim "stops at the limit", and removing a cross-fade "is refused with COPY-notice.length_full". The user asked for a shorter clip and got an even shorter one.
   Fix: in `commitLength`, when the candidate is shorter than the current clip and the normalised track is over the limit, return `same(p, ['notice.length_full'])`. Use `fitClipFrames` only for lengthening.

2. **Medium — bundled-music audio clips have no source bound.** `ops.ts:94-95` (`sourceDuration` returns `Infinity` for ids that aren't in `sources`), `ops.ts:396`, `ops.ts:914`.
   Scenario (probed): `addMusic` places a 5 s track, then `trimTo(id, 'end', 30 s)` without `maxOut` gives `out = 30 s`, so the clip plays 25 s past the track's end. `retime`'s minimum-length extension (`:914`) has the same unbounded fallback. Correctness depends on every caller remembering to pass `maxOut`.
   Fix: give MOD-Core the ENT-MusicTrack durations (or store the source end on the AudioClip). Then resolve the bound in one place and drop the optional `maxOut`.

3. **Low — RULE-19: a gesture that collapses to no step still marks the project unexported.** `src/project/index.ts:62-65`.
   Scenario (probed): the project has a clip and a video export, then a text is added and finished empty in one session. History is unchanged, but `unexported` becomes true because the epoch was bumped on each edit inside the gesture.
   Fix: record the epoch when the gesture's first step is made. When `record` drops the merged step, restore that epoch.

4. **Low — a frame-rate change leaves audio clip fades on the old grid.** `ops.ts:910-918`. Clip fades are re-snapped (`:870`), but `AudioClip.fadeIn/fadeOut` keep old-rate µs values. For example, 3 frames at 25 fps (120 000 µs) becomes 3.6 frames at 30 fps. RULE-10 says fades are "applied as whole frames".
   Fix: snap them like clip fades, then run `fitAudioFades`.

## Spec gaps (propose spec changes; not in the open-questions list)

5. **Sources between 1 frame and 0.1 s.** RULE-02 accepts anything of one frame or more, but RULE-05 sets a 0.1 s minimum. `appendClip`/`duplicateClip` use `Math.min(minFrames, wanted)` (`ops.ts:174`, `:316`), so a 0.06 s video becomes a **2-frame clip**. That breaks RULE-05, and `invariantViolations` flags it (probed: `RULE-05 clip n1 is 2 frames`). The same audio source is refused with `no_audio_room`, which gives the wrong reason.
   Proposal: RULE-02 refuses sources shorter than the 0.1 s minimum with COPY-reason.too_short. Code then drops the `Math.min`.

6. **Frame-rate change when the last clip can't absorb the overflow.** `ops.ts:893-896` refuses the whole rate change (`length_full`), including the automatic 60 fps detection inside `addMedia`. RULE-03 only says "shortens the last clip". This needs a rule, for example shortening from the end backwards across clips.

7. **Move-rule tie.** `src/core/audio.ts:84` sends equal distances to the earlier start. Neither RULE-12 nor D-021/D-027 states this. Add it to RULE-12.

## Boundary (ADR-0011 §2, MOD-Core responsibility)

8. Rule maths that ADR-0011 §2 and MOD-Core.md assign to MOD-Core live in MOD-Project:
   - RULE-06 speed steps and stops (`setSpeed`, `ops.ts:507-529`)
   - RULE-04 re-timing, including the audio overlap resolution (`retime`, `:862-928`)
   - RULE-05 split cut and cross-fade removal (`:443-473`)
   - RULE-10 audio fade shrinking and audio trims (`fitAudioFades`/`trimAudio`, `:401-435`)

   Fix: move them into `src/core/timing.ts` / `audio.ts` as pure functions and keep `ops.ts` as composition. This also shrinks the 928-line file.

## Tests that don't verify what they claim

9. **The INV-03 check can never fail.** In `src/core/check.ts:44-45`, `span.frames !== n` is always false because `layoutClips` uses the same `clipFrames`. Yet the property test "INV-03 INV-04 INV-06 hold…" leans on it. The checker also misses:
   - video `out` ≤ source duration (RULE-05 "can't extend beyond its source")
   - audio `out` ≤ source/track length
   - text and audio starts ≥ 0
   - audio fades ≤ 5 s and their sum ≤ the clip

   Add these checks; for INV-03, recompute the boundaries independently (cumulative sums from the raw fields).

10. **The property generator hides findings 2 and 5.** `tests/property/project.invariants.property.test.ts:55` sets `secs = tenths/10 + 0.2`, so it never makes a source shorter than 0.2 s. `:65` always passes `maxOut = 30 s` to `trimTo`, and music never takes the no-`maxOut` path.
    Let durations go down to one frame, and call `trimTo` without `maxOut` for music.

11. **The `pickedFrames` property doesn't pin the rounding.** `tests/property/core.time.property.test.ts:44-51` accepts |n − exact| ≤ 0.5, so it doesn't check that exactly halfway rounds **up**. Only the single F-009.AC8 unit case pins it. Assert `n === Math.floor(exact + 0.5)` when `exact` ≥ the minimum.

## Maintainability (brief)

- `history.ts:50-59`: `sameDocument` compares by identity only. A slider dragged away and back to its start value therefore records a step that changes nothing. A value comparison of the changed items would drop it.
- ADR-0011 §3 depth "up to 500 under 32 MB" is implemented as a fixed 200. That meets RULE-13, but the ADR and code disagree; note it in the ADR or implement it.
- ADR-0011 §4: there is no hook yet telling MOD-Media when a removed source's last restoring step is dropped (`record` slices silently at `:43`). Needed before MOD-Media releases registry entries.
- `beginGesture(_key)` ignores its key (`index.ts:47`). Either drop the parameter or use it for coalescing as the ADR describes.

## Checked and correct
- Frame maths: frame starts, nearest with halfway going earlier, halves rounding down, and minimums rounding up.
- `fitClipFrames` skip-step: it is safe because shortening can only grow the total through cross-fade shrinking.
- Cross-fade carry rules for reorder, delete, duplicate and split, and split-inside-cross-fade removal.
- Proportional fade shrinking.
- RULE-12 placement and the move rule, including the original place counting as free.
- Gesture coalescing and undo/redo selection and playhead.
- framePlan weights summing to 1, equal-power voice curves, and INV-07 cut-offs.
