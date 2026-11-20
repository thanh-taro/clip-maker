# Resume point — 2026-11-20, build phase complete

**State:** phase 4 (build) gate **passed**, with the owner's approval. All 23 M-1 features are `shipped`. Next: phase 5, QA (not started).
`main` at the commit holding this note is green: `pnpm check` 9/9 (1060 unit, 927 e2e), and `pnpm check:realtime` 17 passed and 1 skipped.

## Start QA
- Run `/build-my-app:start`. It reads `.build-my-app/state.json`, and `next` says `START: phase 'qa'`.
- The inputs QA needs are in `.build-my-app/reports/gate-build.md` and in the "Manual device checks (QA)" section of `.build-my-app/reports/build-spec-questions.md`:
  - iPhone, Safari, Android and reference-device checks;
  - F-001.AC9, the 3.5 GB 4K file on the reference phone;
  - Q25, Q39, Q45 and Q172.
- Release blocker by design: the placeholder music (DEP-14). Shortlist CC0 tracks before release, ask the owner before downloading, and let the owner pick 8+.

## Machine rules (the PC crashed twice from test memory)
- The budget is 1 test worker, 1 heavy run and 1 builder (`bma_state.py resources`). Configs default to 1 worker.
- Run every build or test through `bma_heavy.py`. Check that memory pressure is "normal" before a full check, which takes about 30 min. Run it in the background.
- Reviewers read code and don't run e2e. Kill leftover vite, host-harness and tsc processes after an aborted run.
- Restore regenerated screenshots after test runs with `git checkout -- .build-my-app/reports/screens`.
