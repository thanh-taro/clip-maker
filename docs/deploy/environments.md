# Environments (ADR-0014)

Names only. Never put a value for a secret in any file. Nothing below is provisioned yet; every
account, billing, domain, DNS and secret step is **user-owned** (see `runbook.md`).

| Environment | Address | Serves | Build-time `HOST_ORIGINS` | Build-time `TOOL_ORIGIN` |
|---|---|---|---|---|
| local dev | `http://localhost:5173` (`pnpm dev`) | source; no security headers | n/a | n/a |
| local release preview | `http://localhost:4173` (`pnpm build && pnpm preview`) | exact `dist/` with `dist/_headers` | production value plus a stub host origin for frame tests | default |
| staging | `https://clip-maker-staging.tarokit.app` (owner's domain, placeholder until confirmed) | release candidate | the portal's staging origin if one exists, else empty (standalone only) | `https://clip-maker-staging.tarokit.app` |
| production | `https://clip-maker.tarokit.app` | approved release | `https://tarokit.app` | `https://clip-maker.tarokit.app` |

## Configuration variables (what the code actually reads)
Read via `process.env` in `scripts/`, `vite.config.ts`, `playwright.config.ts`. The app itself reads
no runtime environment: nothing is fetched or configured at run time. Both origins are compiled in
at build time. All are listed in `/.env.example`.

| Name | Kind | Read by | Purpose | Default |
|---|---|---|---|---|
| `HOST_ORIGINS` | build config, not secret | `scripts/gen-headers.mjs` (and `vite.config.ts` `__HOST_ORIGINS__`) | Space-separated origins allowed to embed the tool: CSP `frame-ancestors` and the runtime message allow-list. Empty = standalone only. No wildcards; http only for localhost | `https://tarokit.app` |
| `TOOL_ORIGIN` | build config, not secret | `scripts/gen-headers.mjs` | The tool's own origin, sent as `Access-Control-Allow-Origin` on `/assets/*` (worker and worklet modules) | `https://clip-maker.tarokit.app` |
| `E2E_PORT` | test only | e2e config | Preview port for `pnpm test:e2e` | per-checkout 30000-31999 |
| `BMA_TEST_WORKERS` | test only | `vite.config.ts`, `playwright.config.ts` | Test worker count | 1 |
| `E2E_REUSE` | test only | `playwright.config.ts` | Reuse a running server | unset |
| `CI` | test only | `playwright.config.ts` | Playwright CI mode | unset |
| `LICENCE_STRICT`, `LICENCE_RELEASE` | check flags | `scripts/check-licenses.mjs`, `check-dist.mjs` | Same as `--strict` / `--release` | unset |
| `CLOUDFLARE_ACCOUNT_ID` | phase 7, identifier (private, not a secret key) | wrangler (see `wrangler.jsonc` comment) | Account to publish to | none; owner sets in phase 7 |
| `CLOUDFLARE_API_TOKEN` | phase 7, **SECRET** | wrangler | Authenticates wrangler. Scope: Workers edit on the one account and DNS/routes edit on the one zone | none; owner sets in the shell only. Alternative: interactive `wrangler login` (no token file) |

No other secrets exist: no API keys, analytics ids or signing keys. The tool is not signed or
submitted to an app store.

## External services and accounts (all owner-owned)
- **Cloudflare account**, free tier, holding the `tarokit.app` zone: static assets (Workers) for
  staging and production, custom domains, certificates, DNS. Billing: none expected on the free
  tier; the owner confirms limits.
- **Domain `tarokit.app`**: subdomains `clip-maker` and `clip-maker-staging` (owner-owned DNS).
- **TaroKit portal** (host): catalogue entry and, for `share`, the portal change request.
- **GitHub**: source link target only; no integration.
- Not used: analytics, error reporting, other CDNs, email, databases, payments.

## Domains
Placeholders until the owner confirms: `clip-maker.tarokit.app`, `clip-maker-staging.tarokit.app`,
portal `https://tarokit.app`. Staging portal origin: `<OWNER: exists? value>`.
