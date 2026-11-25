# Resume point — 2026-11-25, release candidate approved

**State:** phase 6 (release) gate G6 **passed** with the owner's approval. Candidate `v1.0.0-rc.1` (local tag, commit ea464b7); artifact `release/1.0.0/` (rebuild: `pnpm release:build v1.0.0-rc.1`), checksums and verification in `.build-my-app/reports/release-1.0.0.md`. Next: phase 7 (deploy), only when the owner is ready.

## Phase 7 needs the owner first (hard stops)
- Cloudflare account, `tarokit.app` zone, wrangler login; approve installing wrangler (DEP-31).
- Portal staging origin (or none: standalone-only staging).
- Legal review of `docs/legal/*` drafts; support URL, operator details, effective dates.
- Follow `docs/deploy/runbook.md` (staging S1–S12, production P1–P8, rollback). Production uploads exactly `release/1.0.0/` (without `*.map` unless decided otherwise).
- Any code change now needs `v1.0.0-rc.2`, re-verified.

## Machine rules (the PC crashed twice from test memory)
- The budget is 1 test worker, 1 heavy run and 1 builder (`bma_state.py resources`). Configs default to 1 worker.
- Run every build or test through `bma_heavy.py`. Check that memory pressure is "normal" before a full check, which takes about 30 min. Run it in the background.
- Reviewers read code and don't run e2e. Kill leftover vite, host-harness and tsc processes after an aborted run.
- Restore regenerated screenshots after test runs with `git checkout -- .build-my-app/reports/screens`.
