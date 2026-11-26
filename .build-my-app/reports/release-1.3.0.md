# Release 1.3.0 — F-028 colour replace (D-053, M-5)

**Candidate:** `v1.3.0-rc.1` = commit 350f27f. **Final:** `v1.3.0` (same commit, same build).
**Live:** 2026-11-26 at https://clip-maker.tarokit.app, Cloudflare version `7ad63dd5-3b95-4a24-8400-6e3a80da564b`, replacing 1.2.0 (`18269145-b881-468e-8ff1-fa9955032258`).

## Scope
- F-028 Replace a colour `shipped`: up to three replacements per clip, pick from the picture (pointer, touch magnifier, keyboard marker), Range and Softness, grey From refused, faint From hinted.
- Bug fix: CMP-ColourPicker dropped a typed hex when Done was clicked without Enter (always in WebKit: a clicked button takes no focus, so the field never blurred) or when Enter came before the re-render. Found by the full run (1 WebKit failure, then 2/5 on repeat). Fixed in 99a7f16; new test fails on the old code (WebKit) and passes on the new; the failing test passed 8/8 after the fix. Also affects duotone Custom (1.2.0).

## Verification (local, via bma_heavy, 1 worker)
| Check | Result |
|---|---|
| `pnpm check` on 26030c3 (before the fix) | 1114 passed, 13 skipped, 1 failed (the picker bug above) |
| `pnpm check:realtime` | 17 passed, 3 skipped (opt-in benchmark) |
| After the fix: colour-replace + colour-tools-ui specs, both engines | 70/70 passed |
| After the fix: `pnpm check:fast` (spec lint, codegen, typecheck, lint, unit + property, build, licences, dist scan, size) | all 8 steps passed |
| `spec_lint.py` / `--coverage tests` | 0 errors / only F-001.AC9 (device check, waived) |
| Release build twice from the tag | 49 files; every non-map file identical (maps differ only in bundler placeholder IDs) |

The full e2e suite was not re-run after the one-component fix; the two spec files covering the picker were.

## Artifact
`release/1.3.0/` (49 files, 10 MB with maps); `SHA256SUMS` sha256 `ab904508abb4ef5920b0b831cfaf598cccacb7a7b28b18ad8d6df8a190852875`.

## Production checks (after deploy)
- Hashes: all 38 served files match SHA256SUMS (the 11 others — maps, `_headers`, `.vite/`, `.assetsignore` — are not served by design).
- CSP header equals `_headers`.
- Smoke (`.build-my-app/tmp/smoke.mjs`): Chromium and WebKit PASS — editor ready in ~0.6 s, offline worker registered, 0 errors, 0 foreign requests.
- Portal embed (`.build-my-app/tmp/portal-embed.mjs`): Chromium and WebKit PASS — listed on tarokit.app, embedded editor opens, 0 page errors.

## Not verified (waived under the owner's policy, not passed)
Real phones (iPhone, Android), Firefox, a screen-reader pass, and F-028.AC10's reference-phone timing (estimated from desktop by proxy, ADR-0017).

## Rollback
`WRANGLER_SEND_METRICS=false CLOUDFLARE_ACCOUNT_ID=a883c9c8bc26ff703c6a7894d5b06a02 pnpm dlx wrangler@4.157.0 rollback 18269145-b881-468e-8ff1-fa9955032258` (1.2.0, no colour replace). Projects are not stored between visits, so nothing needs migrating.
