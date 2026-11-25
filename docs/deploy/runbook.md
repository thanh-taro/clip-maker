# Release runbook, Clip Maker 1.0.0 (candidate `v1.0.0-rc.1`)

Targets and headers follow ADR-0014 (amended 2026-11-20). Nothing here has been run. Steps marked
**[USER-OWNED]** (account, billing, domain, DNS, secret, signing, upload, publish, submission) are
never done by the assistant; the owner does them with the instructions given. Network commands are
owner-run, in phase 7 only.

NOTE: exact wrangler command lines are left to the phase 7 session or the owner (the authoring
environment's local-first hook refused to save a file containing them). Use wrangler's upload
subcommand with `--env staging` for staging and with no `--env` for production, plus its
list-deployments and rollback subcommands.

## 0. Versions and artefacts
- Version `1.0.0` in `package.json` (currently `0.0.0`; bumped in the release phase), tag
  `v1.0.0-rc.1`, final `v1.0.0`. Release notes: `docs/release-notes/1.0.0.md`.
- Artefact: `dist/` of a build from a clean checkout of the tag. `dist/.assetsignore` keeps `*.map`
  and `.vite` out of the upload. Sizes are measured by the release build and recorded in `.build-my-app/reports/release-<version>.md`; compressed budgets: `scripts/check-size.mjs`. Since 1.1.0 (D-052) no music ships.
- Record the SHA-256 of `dist/asset-manifest.json` and the tag commit for rollback records.

## 1. Infrastructure definitions (written, not applied)
- `wrangler.jsonc`: production (custom domain `clip-maker.tarokit.app`) and `env.staging`
  (`clip-maker-staging`, `clip-maker-staging.tarokit.app`). Assets only, no Worker script,
  `workers_dev: false`, `preview_urls: false`.
- Headers: generated `dist/_headers` (CSP with `connect-src 'self'`, Trusted Types, `frame-ancestors`,
  Permissions-Policy, HSTS, COOP same-origin, no-cache for HTML and `/sw.js`, immutable `/assets/*`
  with `Access-Control-Allow-Origin` = tool origin, `/sw.js` CSP). Do not hand edit; regenerate with
  `pnpm gen`.
- Host requirement (F-021): no HTML/JS/CSS rewriting by the host (no Rocket Loader, auto-minify,
  Web Analytics or Zaraz injection, email obfuscation); see `offline-checks.md`.
- Migrations: none (no database, no stored project).

## 2. Pre-release (local)
1. Clean checkout of the tag; `pnpm install --frozen-lockfile`.
2. `pnpm check`, then `pnpm check:release` (`release-checklist.md`). Both must pass.
3. Production build: `env -u HOST_ORIGINS -u TOOL_ORIGIN pnpm build`. Record checksums of `dist/`.

## 3. Staging
The origins are compiled into `dist/`. A staging build needs
`TOOL_ORIGIN=https://clip-maker-staging.tarokit.app` (and the staging `HOST_ORIGINS`), so it is a
different build from production, and `pnpm check:release` (which demands production values) fails on
it by design. Use steps S5 and S8 instead (open question 1).

| # | Step | Owner |
|---|---|---|
| S1 | A Cloudflare account exists and the `tarokit.app` zone is in it (dashboard, Add a site, if missing). | **[USER-OWNED]** account, domain |
| S2 | Create an API token: My Profile, API Tokens, Create Token, "Edit Cloudflare Workers" template, restricted to the one account and the `tarokit.app` zone. In your shell only, set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Never write them to a file or commit them. | **[USER-OWNED]** secret |
| S3 | Approve and install wrangler (DEP-31 is not yet registered as installed): `pnpm add -D wrangler`; review the dependency change. | **[USER-OWNED]** approval |
| S4 | Build staging with `HOST_ORIGINS` set to the staging portal origin (or empty) and `TOOL_ORIGIN=https://clip-maker-staging.tarokit.app`, via `pnpm build`; then `pnpm check:dist`. | local |
| S5 | Before upload, confirm `dist/_headers` shows the staging origin in `frame-ancestors` and in the `/assets/*` `Access-Control-Allow-Origin`. | local |
| S6 | Upload `dist/` to staging with wrangler (`--env staging`). The first run creates the Worker and the custom-domain DNS record (the zone must be in the same account). | **[USER-OWNED]** upload, DNS |
| S7 | Confirm `dist/_headers` carries `X-Robots-Tag: noindex` under `/*` (ADR-0014; `scripts/gen-headers.mjs` adds it to every build whose `TOOL_ORIGIN` is not production). | local |
| S8 | Headers: read the response headers of `/`, `/sw.js` and one `/assets/<file from asset-manifest.json>` on the staging host (browser DevTools, Network, or a header-only HTTP request). Compare with `dist/_headers`: CSP (`connect-src 'self'`, `require-trusted-types-for 'script'`, `trusted-types clip-maker`, `frame-ancestors`), Permissions-Policy, HSTS, `no-cache` on `/` and `/sw.js`, immutable on `/assets/*`, `Access-Control-Allow-Origin`. `scripts/check-release-headers.mjs` reads a local `dist/` only; it has no URL mode (open question 3), so it runs on the local build, not on the URL. | **[USER-OWNED]** network |
| S9 | Bytes: fetch `/asset-manifest.json` from staging and compare its SHA-256 with the recorded checksum of the staging build. A mismatch means host rewriting. | **[USER-OWNED]** |
| S10 | Offline check from `offline-checks.md` (service worker `activated`, one complete cache), standalone in a fresh profile, then embedded. | **[USER-OWNED]** |
| S11 | Functional smoke: open, add a clip and a bundled track, export MP4, GIF and audio. In DevTools Network, every request goes to the staging origin only; the OPFS folder `clip-maker-scratch/` is empty after export. | **[USER-OWNED]** |
| S12 | Real-device checks (iPhone, Android, Firefox) were waived (QA-5); record as waived, never as passed. | **[USER-OWNED]** |

Record each result in `.build-my-app/reports/deploy-staging.md`. Any failure stops the line.

## 4. Production (only after the owner approves staging)
| # | Step | Owner |
|---|---|---|
| P1 | Owner approves the staging results and the final tag `v1.0.0`. | **[USER-OWNED]** |
| P2 | Rebuild from the tag with production values (section 2, step 3); `pnpm check:release` passes; record checksums. | local |
| P3 | Note the current deployment id with wrangler's list-deployments subcommand (first release: nothing to roll back to). | **[USER-OWNED]** |
| P4 | Upload `dist/` with wrangler, no `--env` (top-level config; creates the custom domain `clip-maker.tarokit.app`). | **[USER-OWNED]** upload, DNS |
| P5 | Repeat S8 to S11 against `https://clip-maker.tarokit.app`. Exact values: `frame-ancestors https://tarokit.app`; `Access-Control-Allow-Origin: https://clip-maker.tarokit.app`. | **[USER-OWNED]** |
| P6 | Embedded check on the portal: the frame loads, ready signal accepted, a download works from the frame. | **[USER-OWNED]** |
| P7 | Catalogue entry per `docs/release/listing.md` (portal repository change; permissions `downloads`, `file-pick`, `dialogs`, `fullscreen`, `share`); privacy and terms URLs only after legal review; support URL. | **[USER-OWNED]** publish, submission |
| P8 | Tag `v1.0.0` and push tags. | **[USER-OWNED]** |

## 5. Monitoring (no telemetry exists, by design)
- Cloudflare dashboard: request volume, 4xx and 5xx, bandwidth for the Worker and zone. Do not
  enable Web Analytics, Zaraz or Logpush: they conflict with the privacy statement.
- Certificate and DNS status (managed by Cloudflare).
- Repeat S8 to S10 after any Cloudflare setting change.
- User reports through the support URL (owner-owned). Known failure sign: works online but never
  offline = host rewriting.

## 6. Rollback
- Keep the previous build: Cloudflare keeps earlier Worker versions. Dashboard: Workers, `clip-maker`,
  Deployments, pick the previous version, Rollback **[USER-OWNED]**; or wrangler's rollback
  subcommand with the version id **[USER-OWNED]**. Alternative: check out the previous tag, rebuild
  with production values and upload again.
- Afterwards repeat S8 to S10. Offline copies update when the service worker sees the new version.
- Emergency containment: detach the custom domain in the dashboard **[USER-OWNED]**.
- Nothing on the user side needs migrating.

## Open questions (owner)
1. Staging is a different build from production (origins compiled in), so production bits are not
   the bits tested on staging. Accept and re-run header checks on production, or change the design?
2. Resolved in the release phase: `scripts/gen-headers.mjs` now generates `X-Robots-Tag: noindex` for
   every non-production build; production headers carry none.
3. `check-release-headers.mjs` cannot target a URL. Accept manual header comparison, or add a URL mode?
4. Does a portal staging origin exist (staging `HOST_ORIGINS`)?
5. DEP-31 (wrangler) approval at S3.
6. Cloudflare log settings, for the privacy notice.
