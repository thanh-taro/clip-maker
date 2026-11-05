# Local development

Everything runs on this machine (ADR-0014 "Environments", ADR-0002 §5: no code-host workflows). The
tool has no backend, no database, no accounts and no paid services, so there is nothing to seed or
fake: it is a static page served from `localhost`. Nothing is deployed, uploaded or provisioned
before phase 7.

## Requirements
- Node 24 (`.nvmrc`) and pnpm 11 (`packageManager` in `package.json`; `corepack enable` provides it).
- Python 3 for the spec tools (`tools/`).
- Optional: Google Chrome (the opt-in `chrome` e2e project, D-035); mkcert (DEP-33) for LAN HTTPS
  to phones (below).

## Commands
| What | Command |
|---|---|
| **Set up** (install from the lockfile, Playwright's Chromium + WebKit, generate) | `pnpm bootstrap` |
| **Run** (dev server with hot reload, http://localhost:5173) | `pnpm dev` |
| **Preview the production build** (the exact `dist/` with its `_headers`, http://localhost:4173) | `pnpm build && pnpm preview` |
| **Check** (every local gate incl. the e2e smoke, below) | `pnpm check` |
| **Check without e2e** | `pnpm check:fast` |
| **Wall-clock tests** (@realtime: A/V sync, export speed, underruns; quiet machine, every wave gate and QA) | `pnpm check:realtime` |
| **Reset** (remove build/test output and the Vite cache, regenerate) | `pnpm reset` (`pnpm reset --all` also removes `node_modules`; then `pnpm bootstrap`) |

`pnpm setup` is a built-in pnpm command, hence `bootstrap` (as in the sibling tools).

## Environments
| Environment | Command | Serves |
|---|---|---|
| local (dev) | `pnpm dev` | source, hot reload, port 5173; no security headers |
| local (release preview) | `pnpm build && pnpm preview` | the exact `dist/` **with** `dist/_headers` (real CSP), port 4173; the e2e suite starts its own preview on a per-worktree port |

Embedded testing in a stub host page and the offline harness arrive with F-019 / F-021
(adapters/tests.md). Phones on the LAN need HTTPS (codec APIs need a secure context): create a
locally trusted certificate with mkcert and run the dev server with it; never use a public tunnel
(ADR-0014).

## Variables
See `.env.example`. `HOST_ORIGINS` (build time, default `https://tarokit.app`) and `TOOL_ORIGIN`
(default `https://clip-maker.tarokit.app`) change `public/_headers`; `pnpm gen` writes it for the
defaults. No variable is a secret; the Cloudflare ones stay empty until phase 7.

## Tests
| Suite | Command | Notes |
|---|---|---|
| Unit + property (Vitest, fast-check) | `pnpm test` (`pnpm test:watch`) | `tests/unit`, `tests/property` |
| E2E (Playwright, Chromium + WebKit) | `pnpm build && pnpm test:e2e` | one engine: `--project=chromium`; branded Chrome: `E2E_CHROME=1 pnpm test:e2e --project=chrome` |
| Spec coverage | `python3 tools/spec_lint.py --coverage tests` | acceptance criteria without a test |

Test names start with the spec ID they verify (`adapters/tests.md`).

## The check (`pnpm check`)
Runs in order and stops at the first failure: `python3 tools/spec_lint.py` → `gen:check` (generated
files up to date) → `typecheck` → `lint` (ESLint incl. the network/storage bans, their per-module
allowances and module boundaries, then Prettier) → `test` → `build` → `check:licenses` (ADR-0001 over
the whole lockfile, then the `dist/` scan) → `check:size` (architecture.md budgets, no lazy chunks)
→ `test:e2e` (smoke on Chromium + WebKit). The licence step lists registry rows still pending the
licence audit; `pnpm check:licenses --strict` fails on them.

## Generated files
`pnpm gen` (also the first step of `dev` and `build`) regenerates, from the specs:
`src/app/styles/tokens.gen.{css,ts}` and `src/core/palette.gen.ts` (tokens.json),
`src/core/project.gen.ts` (project.schema.json), `src/copy/messages.gen.ts` (copy.md),
`src/core/looks.gen.ts` (looks.md), `public/third-party-notices.txt` (dependencies.md) and
`public/_headers` (boot script + `HOST_ORIGINS` + `TOOL_ORIGIN`). They are checked in; never edit
them by hand (`adapters/codegen.md`).
