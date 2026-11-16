# Release checklist (local release candidate)

Run on the local machine for each release candidate, before anything is uploaded (the release phase;
deploying is a separate, user-approved step). Each step must pass; a failure stops the release.

1. `pnpm check` — the everyday gate (spec lint, codegen, types, lint, unit and e2e tests, build,
   licences, sizes). It builds `dist/`.
2. `pnpm check:release` — the licence gate in release mode
   (`scripts/check-licenses.mjs --strict --release`). On top of `pnpm check:licenses` it fails when:
   - the music pack still has placeholder tracks (`"placeholder": true` in `src/assets/music/music.json`,
     DEP-41 … DEP-43; build question 114), or fewer than the 8 tracks RULE-12 needs;
   - `dist/` ships a placeholder music file (the dist/ scan, `scripts/check-dist.mjs --release`).
3. The staging smoke check in [offline-checks.md](offline-checks.md) after the staging deploy.
