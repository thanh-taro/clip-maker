# Resume point — 2026-11-26, 1.3.0 live (D-053 colour replace); listed in the portal (1.5.4)

**State:** all phases done. 1.3.0 deployed 2026-11-26 (`release-1.3.0.md`; rollback target 1.2.0 `18269145`). D-053 complete (F-024–F-028 shipped). 1.1.0 deployed 2026-11-25 (`deploy-1.1.0.md`; rollback target 1.0.0 `3d9c129d`). Gate G7 for 1.0.0 passed: the owner confirmed `v1.0.0` live at `https://clip-maker.tarokit.app` (`.build-my-app/reports/deploy-1.0.0.md`). No staging host (D-051).

## Next
- Owner: turn off Cloudflare Network Error Logging (NEL) for the zone (privacy review #1).
- Changes or new features: `/build-my-app:change` (spec first, then a new candidate `1.0.1`/`1.1.0`, re-verified, deployed with `pnpm dlx wrangler@4.157.0 deploy --env="" --assets release/<version>`).
- Owner to-do: fill `CONTACT_EMAIL` and the effective date in `docs/legal/*`, publish them (e.g. on the portal); optional lawyer review.
- Waived device checks (QA-5) remain in `qa-owner-checklist.md` for a later pass.

## Machine rules (the PC crashed twice from test memory)
- The budget is 1 test worker, 1 heavy run and 1 builder (`bma_state.py resources`). Configs default to 1 worker.
- Run every build or test through `bma_heavy.py`. Check that memory pressure is "normal" before a full check, which takes about 55 min. Run it in the background.
- Reviewers read code and don't run e2e. Kill leftover vite, host-harness and tsc processes after an aborted run.
- Restore regenerated screenshots after test runs with `git checkout -- .build-my-app/reports/screens`.
