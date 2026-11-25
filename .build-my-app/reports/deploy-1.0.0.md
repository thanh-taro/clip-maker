# Deploy 1.0.0

Date: 2026-11-25 · Candidate `v1.0.0-rc.1` (ea464b7), tagged final as `v1.0.0` (the same commit) · Owner decisions: G6 approval, D-051 (no separate staging host).

## What went where
| Target | How | Result |
|---|---|---|
| Production `https://clip-maker.tarokit.app` (Cloudflare Workers static assets, worker `clip-maker`, custom domain) | `pnpm dlx wrangler@4.157.0 deploy --env="" --assets release/1.0.0`, owner's existing wrangler login, telemetry off | 48 files uploaded (source maps and `.vite` excluded by `.assetsignore`), version ID `3d9c129d-76d0-4d38-b340-ad6cefd4391c` |

No staging host (D-051), so the checks below ran on production right after the upload.

## Post-deploy checks (production)
| Check | Result |
|---|---|
| Every shipped file served byte-identical to `release/1.0.0/SHA256SUMS` | pass: 46 files direct; `/index.html` redirects 307 to `/`, which serves it byte-identical; `_headers` is applied as configuration and not served (404) |
| Page headers equal the build's `_headers` | pass: CSP exact match (`frame-ancestors https://tarokit.app`, Trusted Types); Permissions-Policy, Referrer-Policy no-referrer, nosniff, COOP same-origin, HSTS, `Cache-Control: no-cache`; no `X-Robots-Tag` |
| `/sw.js` CSP `default-src 'none'; connect-src 'self'`; `/assets/*` immutable cache and CORS `https://clip-maker.tarokit.app` | pass |
| Source maps not served (`/sw.js.map` 404) | pass |
| Browser smoke on production, Chromium and WebKit (`.build-my-app/tmp/smoke.mjs`): editor opens, no console errors, no request to any other origin, offline worker registered | pass (Chromium 543 ms, WebKit 727 ms) |
| FLOW-01 and the full e2e suite | passed locally against the same release build (`release-1.0.0.md`); not re-run against production, because the e2e harness serves its own builds |

Not checked: embedding from the live portal `https://tarokit.app`, which is outside this project; the host-integration e2e covers the contract locally. Device checks are waived (QA-5).

## Rollback
`pnpm dlx wrangler@4.157.0 rollback` (choose the previous version) or the Cloudflare dashboard › Workers › clip-maker › Deployments. This is the first release, so there is no earlier version to return to; to take the tool offline, remove the custom domain in the dashboard.

## Monitoring
No analytics or error reporting by design (NFR-01, privacy policy). Watch: the Cloudflare dashboard request and error counts (4xx/5xx) for the hostname during the first week, and owner or user reports.
