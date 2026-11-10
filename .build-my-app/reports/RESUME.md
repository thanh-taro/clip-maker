# Resume point — paused 2026-11-10 (owner request: token cost)

**State:** phase 4 (build), wave 3. `main` (commit holding this note) is green: `pnpm check` 9/9 (371 e2e).

## Done
- Wave 0 (E1–E5), wave 1 (F-019, F-020, F-023), wave 2 (F-021, F-022, F-001): merged, owner-reviewed.
- Wave 3 merged, each with one review + fixes + `pnpm check`:
  F-002 preview, E6 source sound decoding, F-003 arrange/timeline, F-014 undo/redo, F-012 frame.

## In progress — F-011 music & sound (last unit of wave 3)
- Paused mid-build on branch `worktree-agent-a59f0c10971e8322c`
  (worktree `.claude/worktrees/agent-a59f0c10971e8322c`), WIP commit e5a6f76 (does not build yet; stream.ts audition export missing — see handoff).
  Handoff note: `.build-my-app/reports/F-011-handoff.md` on that branch.
- To resume: start one `feature-builder` in that worktree (it is kept) with the original F-011 brief
  plus "continue from the WIP commit and F-011-handoff.md". Brief essentials: no internet downloads;
  real music pack mechanism with 2–3 self-generated placeholder tracks marked
  `placeholder — not for release` (DEP-14; real tracks = owner curation D-034); reuse E6 SoundBank,
  F-003 timeline (audio lane), F-012 inspector (`frameSectionShown` must account for audio selection),
  F-014 `beginGesture()` for the volume slider, Q104 default normalisation; questions from 112;
  drag e2e measure after `settled()`; status `building`; don't merge.
- If the worktree is missing, restart F-011 from main with the same brief.

## Then
1. F-011: one code-reviewer → fixes → merge → `pnpm check`.
2. Wave 3 gate: `pnpm check:realtime` on a quiet machine (load < 12).
3. Pause for the owner's wave 3 review. Open owner questions in
   `.build-my-app/reports/build-spec-questions.md`: 83 (export-audio budget 12 KB), 84 (stereo
   down-mix rules), 85 (sample timing; WebKit export packet stamps), 86a (WAV via `pcm-*` decoder vs
   ADR-0008 §2), 88 (vi-VN short tile labels), 89 (notice placement with docked sheet), 93, 94
   (ADR-0002 §1: DOM timeline), 98, 99 (undo past playhead during playback), 101 (history 200 vs
   ADR-0011), 103 (RULE-13 multi-item selection), 105 (compact inspector resize/close), 111
   (inspector hidden while drawer open < 1000 px), plus F-011's.
4. Waves 4–5 per `build-plan.md` (F-007 must handle Q104).

## How to resume cheaply
- `/build-my-app:start` reads `.build-my-app/state.json` and this note.
- One builder at a time; one reviewer per feature; small spec edits done directly; `pnpm check` only
  after merges. If an e2e fails, re-run it alone with `--workers=1` before suspecting the code.
- Each unit: worktree builder → review → fixes → merge → `pnpm check` → remove worktree.

## Housekeeping
- Spike worktrees (`.claude/worktrees/agent-*` on `spike/*`) are kept as phase 3 evidence.
- QA-open: Q25 (decoder fallback, phone), Q39 (colour range tag), Q45 (AAC estimate on real music).
- Owner checks pending: music shortlist (D-034), look sign-off, floor stills, chart MP4 player
  check, Android, iPhone device checks.
