# Spec review — round 1 (5 reviewers)

Per-reviewer findings: `spec-review-r1/*.md`.

**Totals**
- 7 blockers. Duplicates found independently by more than one reviewer:
  - device-check contradiction (RULE-22) — 2 reviewers;
  - audio placement (RULE-12) — 3 reviewers;
  - cross-fades on edit and the length cap — 3 reviewers.
- About 45 majors and about 35 minors.

**Product decisions (owner, 2026-11-03):** D-012 … D-023.
- Owner chose a fixed centre playhead on touch (D-013), against the recommendation.
- All other answers followed the recommendation.

## Applied
**Rules**
- RULE-01 … RULE-23 rewritten. RULE-23 (new project) is new.
- Frame-time arithmetic in µs: frame starts are floored, minimums round up, boundaries are cumulative.
- Source-frame mapping and fixed times for text and audio.
- RULE-03 covers every lengthening edit.
- RULE-05: cross-fade behaviour on delete, duplicate and reorder.
- RULE-08 quality criteria are now measurable.
- RULE-10: fade curves, shrinking, and the blur background during fades.
- RULE-11: coordinates, default colours and grapheme counting.
- RULE-12: placement, overlap handling, linear volume, true-peak limiter, and the one-time mute.
- RULE-13: batch add and text steps, selection after undo.
- RULE-14: scroll-follow and the touch fixed playhead.
- RULE-15: MB definition, bitrate floor and target handling.
- RULE-16: GIF default range.
- RULE-19: only full-project exports clear the warning.
- RULE-20: focused controls keep their own keys; Mod+V; I/O and Alt+arrows; compare key.
- RULE-21: gesture → control equivalences.
- RULE-22: non-blocking slow device.

**Model and schema**
- ENT-MusicTrack added. INV-02 is scoped per export kind.
- Schema: kind conditionals, `additionalProperties`, speed step, text coordinates.

**Product, glossary and quality**
- NFR-01: everything is fetched on the first visit. NFR-02 is now measurable. NFR-04 fixture bars aligned. NFR-08 colour, GIF and audio measures. NFR-10 split.
- Glossary entry for Frame fixed.
- Vision: keyframes are a non-goal for M-1 and M-2.

**Copy:** about 45 strings added or fixed. Covers refusal reasons, size-target messages, typeface, style and quality names, missing capabilities, and the in-tool licence notices. Privacy details reworded about leftover scratch. VI zoom_fit duplicate removed.

**Features:** every finding was applied across F-001 … F-023, with new requirements and ACs where reviewers asked. Notable:
- F-010.R8 and F-011.R8: time-move controls.
- F-007.R7: compare.
- F-015: ACs for size target, estimate, progress, cancelled save and leftover scratch.
- F-019.R7: export with scratch space while embedded.
- F-020: repository URL pinned; notices shown inside the tool.

**Spikes:** SP-hdr and SP-size-target added. SP-frame notes the cross-origin-isolation impact on the host contract. SP-mem-phone now includes 5K input.

## Not applied, or deferred, with reasons
- Per-look colour definitions → phase 2 (design). Each look gets an owner sign-off on reference images (noted in F-008).
- The speed threshold for "slow device", the format fallback order and the bitrate floors → `40-technical` (phase 3), as the rules already say.
- **Assumption:** repository URL `https://github.com/thanh-taro/clip-maker`, following the sibling-tool pattern. The owner confirms it at G1.
