# Resume point — 2026-11-25, 1.2.0 live (D-053 colour tools) and listed in the portal (1.5.4)

**State:** all phases done. 1.1.0 deployed 2026-11-25 (`deploy-1.1.0.md`; rollback target 1.0.0 `3d9c129d`). Gate G7 for 1.0.0 passed: the owner confirmed `v1.0.0` live at `https://clip-maker.tarokit.app` (`.build-my-app/reports/deploy-1.0.0.md`). No staging host (D-051).

## Next
- 1.3.0: F-028 colour replace (draft, M-5): spec review, then build like 1.2.0 (engine slot is reserved in the grade pass).
- Owner: turn off Cloudflare Network Error Logging (NEL) for the zone (privacy review #1).
- Changes or new features: `/build-my-app:change` (spec first, then a new candidate `1.0.1`/`1.1.0`, re-verified, deployed with `pnpm dlx wrangler@4.157.0 deploy --env="" --assets release/<version>`).
- Owner to-do: fill `CONTACT_EMAIL` and the effective date in `docs/legal/*`, publish them (e.g. on the portal); optional lawyer review.
- Waived device checks (QA-5) remain in `qa-owner-checklist.md` for a later pass.

## Machine rules (the PC crashed twice from test memory)
- The budget is 1 test worker, 1 heavy run and 1 builder (`bma_state.py resources`). Configs default to 1 worker.
- Run every build or test through `bma_heavy.py`. Check that memory pressure is "normal" before a full check, which takes about 30 min. Run it in the background.
- Reviewers read code and don't run e2e. Kill leftover vite, host-harness and tsc processes after an aborted run.
- Restore regenerated screenshots after test runs with `git checkout -- .build-my-app/reports/screens`.
