# Review: QA fix batch 2 (worktree-agent-a156640de3282b9dd, 231fb95..HEAD)

Scope: CC0 music pack, security follow-ups (QA-3, qa-security L1/L2/I2), text-bitmap LRU (Q172).
Code was read only: no build and no e2e.

## Checks run
- `python3 tools/spec_lint.py`: 819 IDs, 0 errors, 0 warnings.
- `pnpm test -- <3 files>` (through bma_heavy): the file filter was not applied, so the whole unit suite ran
  (1720 s). Result: **2 test files failed, 1079/1081 tests passed**. The output was cut by `tail`, so the
  failing files are not known. The builder must find them, for example by running
  `pnpm vitest run tests/unit/preview.text-budget.test.ts tests/unit/core.trusted-types.test.ts tests/unit/build.release-checks.test.ts`
  and then the suite with a reporter that prints failures. This blocks a pass until it is explained.

## Critical
None.

## Major
### M1. A text layer that was evicted while near the playhead is never rasterised again when it starts showing
- Where: `src/preview/controller.ts:227-240` (the `nearKey` effect), together with
  `src/preview/text-sync.ts` (`pinned` = showing layers only; near layers that are not showing can be evicted).
- Scenario: on a phone (32 MB budget), the playhead is at 0 s. Layer A shows, and layers B and C start within
  5 s. Their bitmaps together exceed the budget, so B and C are rasterised, then evicted and closed. Only A is
  sent. The unit test "the engine is told to drop evicted bitmaps" builds exactly this state. Press Play. When
  the playhead reaches B.start, the set of near layers has not changed (B was already near), so `nearKey` stays
  the same and `syncTexts()` does not run. B is now showing but the engine holds no bitmap for it, so **the
  text is missing from the preview**. It comes back only when the near set changes for some other reason, or
  when the project is edited. This breaks F-010.R5 (the preview draws what the export draws).
- Fix: build the key from the near ids **plus** the showing ids, for example `near.join(' ') + '|' + showing.join(' ')`.
  More robust: trigger a sync whenever a showing layer is not in `texts.held()`. Add a unit test at controller
  or text-sync level: evict B at t=0, call `update` at t=B.start, and assert that B's bitmap is posted.

## Minor
### m1. Thrash: near layers that cannot fit are rasterised and then closed on every update
- Where: `src/preview/text-sync.ts`, the loop `for (const l of stale) made.push(...)`, followed by `lru.evict(pinned)`.
- Scenario: in the M1 state, every project change (each keystroke while typing in A) rasterises B and C again,
  then closes them at once. That is wasted main-thread canvas work on the devices with the least headroom.
- Fix: choose what to rasterise within the budget before rasterising, nearest first. Pinned layers always go;
  others go only while the estimated bytes still fit. You can estimate from the size of the held bitmap or
  from `layoutText`. Alternatively, skip layers that were evicted at the same raster key until the playhead
  moves.

### m2. ADR-0009 §4 budget versus the export path
- Where: `src/preview/text.ts` (the function near line 300 that rasterises **every** text layer for an export).
- The export still holds every layer's bitmap at once, at output resolution, which is the case the brief asked
  about. If ADR-0009 §4's text budget is meant to cover the export too, this is a gap. If it covers the preview
  engine only, state that in ADR-0009 §4 or MOD-Export so the next review does not raise it again.
  Recommendation: add a note to the spec. Changing the code is not needed for this batch unless the spec says so.

## Checked and fine
- **TT policy** (`src/core/trusted-types.ts`): only http(s) URLs of the same origin pass. blob:, data:,
  javascript: and other origins are refused (unit tested). There is no HTML or script policy. Engines without
  `trustedTypes` (older Safari/Firefox) get the same check and a plain string. The policy is created lazily
  once per realm. The dev server sends no CSP, so module re-evaluation under HMR cannot hit the
  duplicate-policy error. The workers use `?worker&url` with `worker.format: 'es'` and `type: 'module'`,
  which is consistent in dev and build. The sw registration goes through `scriptUrl('/sw.js')`.
  `Worklet.addModule` is not a TT sink, and smoke.spec checks it.
- **Engine bitmap lifetime**: `engine.ts` `setTextBitmaps` closes every bitmap that is neither kept nor
  replaced, so evicted ids (left out of `keep`) are released. A bitmap evicted in the same update is closed in
  text-sync and never transferred. Byte accounting is w×h×4, and each `set` replaces the previous entry.
- **Permissions-Policy**: the app does not use encrypted-media or picture-in-picture (grep). `fullscreen=(self)`
  is kept.
- **check-dist scanCode / check-release-headers**: the logic is sound. The tests cover allowed and refused
  cases. A real release build should be run once (`pnpm check:release`) to confirm that the bundled
  libraries contain none of the banned words (for example `WebAssembly`). This could not be verified here.
- **make-music.mjs**: BS.1770 K-weighting coefficients and both gates are correct. The gain is capped by the
  sample peak at −1 dBFS. The fades are applied after the gain (linear fade-in, raised-cosine fade-out).
  Source MP3s are hash-checked. The manifest is written only within the 10 MB music budget. AAC output is not
  bit-reproducible across macOS versions, but the committed checksums make this harmless.
- **Specs**: RULE-12 is met with 9 tracks. The music pack is about 9.06 MB, within the ≤ 10 MB music budget
  (ADR-0013/NFR-10). F-011.R6 credits (title with artist, source page, licence) come from the manifest, and
  third-party-notices are updated. `licences/` sits outside src/ and public/, so it never reaches dist/ or the
  SW precache.
- **audio.playback.spec.ts TT relaxation**: acceptable. It applies only to that one test, which builds its own
  worker from a plain string (only the tool's own policy may do that). The full CSP, including the five
  workers and the worklet, is covered by smoke.spec. Keep the comment.

Status: fixes
