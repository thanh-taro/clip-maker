# Review: D-052 code (branch worktree-agent-a751c61b237b38d9d, c57f57a vs main)

Scope: `git diff main...worktree-agent-a751c61b237b38d9d`; spec F-011 (`spec_query.py context F-011 --full`),
CMP-Toolbar, CMP-Inspector "narrow sheets", F-021, dependencies.md "Music tracks (removed, D-052)".

Checks run (through bma_heavy, worktree): `node scripts/gen-all.mjs --check` (up to date), `pnpm typecheck`
(clean), eslint + prettier on src/scripts/tests (clean), vitest on app.adding, project.items,
build.check-dist, app.playback, app.notices, app.export (126 passed). `spec_lint.py --coverage` on the
branch's tests: only F-001.AC9 uncovered, which is pre-existing on main. No e2e run (per instructions).

## Major

None.

## Verified correct

- Undo grouping: a Music pick is one `addFiles` batch -> one `edit(addMedia)` -> one step (sources and clips
  together). AC1/AC13/AC14/AC15 undo behaviour holds (unit + e2e).
- Selection: `apply()` (src/app/adding.ts:162-167) selects the first audio clip not present before the step.
  `placeAudio` appends in source order (src/project/ops.ts:204), so this is the first file given. When nothing
  is placed (no room, only video/photo), the selection is left alone. Ordinary Add media/drop/paste do not
  select anything (AC12 e2e checks that the flag resets).
- Placement order and no-room: `addMedia` places each file per RULE-12 from the same playhead, so later files
  move to the end of earlier ones. Notices are de-duplicated by `result()`/`unique` (ops.ts:95-98), so a pick
  gives one COPY-notice.no_audio_room. Sources are kept (RULE-01).
- Cancel: `onCancel` resets `musicPick` and changes nothing; the next `pickFiles` also resets it, so a browser
  that never fires `cancel` cannot leak the flag.
- Video/photo via Music: goes through the F-001 intake to the main track; the selection is unchanged (unit + e2e).
- Audio worker / export: the audition protocol, `auditioning` state, `musicIds`, `MusicUnavailable` and
  `deps.music` are all gone. `soundSourceIds` and `soundingSources` now see only sources, and audio sources
  are probed with `hasSound: true` (src/media/probe.ts:173), so export sound detection does not regress.
- SW/precache: nothing music-specific remains. The manifest is built from dist, and the offline e2e now
  asserts that no audio file is precached.
- No runtime or build reference to MusicPicker, music.gen, MUSIC_TRACKS, musicBlob, audition,
  gen-music-manifest or make-music remains in src/, scripts/, tests/ or package.json. The generated copy drops
  music.* and notice.music_unavailable.
- check-dist: any audio extension in dist/ now fails (scripts/check-dist.mjs AUDIO_EXT). Legitimate assets are
  woff2, png looks, js/css/json/txt/html/svg/webmanifest/ico, and none of them match. Correct for D-052.
  DEP-41..49 are `removed`, so `isActive` drops them from the registry checks.

## Minor

1. Retired AC IDs listed in a test comment. tests/e2e/music.spec.ts:12-13 names F-011.AC6/AC7 "so the coverage
   check knows". This is not needed: tools/spec_lint.py:244 (commit f94cff1, on main) already skips
   `**ACn** Retired` lines. The comment also counts as coverage for any future AC that reuses the IDs (IDs are
   not reused, but the tool cannot tell). Fix: drop the IDs from the comment, or reword it to "R6/R7 retired by
   D-052" without the AC IDs. Harmless as written, so it is acceptable but should be tidied.
2. Lost test: the asset-manifest read retry. The deleted assets.music tests held the only check that a failed
   `manifestFiles` read is tried again (`manifestRead` reset). Looks still depend on it (src/assets/index.ts).
   Fix: add one case to tests/unit/assets.looks.test.ts where the manifest first answers 503 and then 200, and
   assert that the second `looks()` call returns all looks.
3. Stale docs that still describe the bundled pack (not runtime, but misleading to the next builder or reader):
   - adapters/codegen.md:21, :66, :73 (gen-music-manifest, MUSIC_TRACKS in the notices view);
   - docs/deploy/release-checklist.md:10-12 (placeholder tracks in src/assets/music/music.json, `--release`
     dist placeholder scan; `check:release` now only gates looks sign-off and headers);
   - docs/deploy/runbook.md:19-21 (9 music files, NFR-10 music budget);
   - docs/legal/terms.md §4 "Bundled music" and docs/legal/privacy-policy.md:48 ("Music source links"). These are
     legal texts and need an owner-approved edit, so route them to the lead/owner, not the builder.
   Fix: update the adapter and deploy docs in this branch; flag the legal pair to the owner.
4. Dead modifier class: src/app/EditSheet.tsx Audio sheet button `tk-sheet__add--music` has no CSS rule.
   Fix: drop it (or keep it as a test hook, but no test uses it). Trivial.

## Simplicity

The Music path reuses the F-001 intake and `addMedia` placement unchanged. The only new logic is the
`AddOptions.music` flag and the select-first-new-audio step, with no duplicated intake or placement. The new
`src/core/source-end.ts` is a one-function module that replaces the music-aware `sourceEnd`. That is fine.

Status: fixes (minor only)
