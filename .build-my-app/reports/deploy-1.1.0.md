# Deploy 1.1.0

Date: 2026-11-25 · Candidate `v1.1.0-rc.1` (ff6d0a9), tagged final as `v1.1.0` (same commit) · Owner decision D-052: no bundled music; approval to deploy when verified (2026-11-25).

## What went where
| Target | How | Result |
|---|---|---|
| Production `https://clip-maker.tarokit.app` | `pnpm dlx wrangler@4.157.0 deploy --env="" --assets release/1.1.0`, owner's wrangler login, telemetry off | 9 new files uploaded (30 unchanged), version `90671757-7117-48df-9798-fc2834450810`; replaced 1.0.0 (`3d9c129d-76d0-4d38-b340-ad6cefd4391c`) |

## Post-deploy checks (production)
| Check | Result |
|---|---|
| Every shipped file byte-identical to `release/1.1.0/SHA256SUMS` (`/` for `index.html`) | pass (38 of 38) |
| Page CSP equals the build's `_headers` | pass |
| Music gone: a 1.0.0 track URL answers 404; the asset manifest lists no audio | pass |
| Browser smoke, Chromium and WebKit: editor opens, no console errors, no foreign request, offline worker registered | pass (652 ms, 977 ms) |

Returning visitors with the 1.0.0 offline copy get 1.1.0 the next time they open the tool online. An open tab is never reloaded (F-021.R3).

## Rollback
`pnpm dlx wrangler@4.157.0 rollback 3d9c129d-76d0-4d38-b340-ad6cefd4391c` restores 1.0.0, which brings the bundled music back. Prefer fixing forward with 1.1.1.
