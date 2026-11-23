# Resume point — 2026-11-23, QA complete and awaiting G5

**State:** phase 5 (QA) is done; gate G5 is waiting for the owner's approval (`.build-my-app/reports/gate-qa.md`). Next: phase 6, release.
`main` at bcb735e: final `pnpm check` passed (1094 unit; e2e 970 passed, 13 skipped by design, 1 test race fixed in bcb735e and re-verified). `pnpm check:realtime` was last run at 61c3038; re-run it on a quiet machine in phase 6.

## After G5
- On approval: `bma_state.py gate qa pass`, then `/build-my-app:start` → phase 6 (release, local only).
- Device and manual checks are waived (QA-5), never passed; release notes say "two desktop engines only".
- Music: 9 CC0 tracks shipped (DEP-41..49). Optional owner listen; four are not marked instrumental on FMA.

## Machine rules (the PC crashed twice from test memory)
- The budget is 1 test worker, 1 heavy run and 1 builder (`bma_state.py resources`). Configs default to 1 worker.
- Run every build or test through `bma_heavy.py`. Check that memory pressure is "normal" before a full check, which takes about 30 min. Run it in the background.
- Reviewers read code and don't run e2e. Kill leftover vite, host-harness and tsc processes after an aborted run.
- Restore regenerated screenshots after test runs with `git checkout -- .build-my-app/reports/screens`.
