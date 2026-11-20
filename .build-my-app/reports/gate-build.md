# Gate — phase 4 (build), milestone M-1 — 2026-11-20

## What was produced
- Engine units E1–E6 and all 23 M-1 features (F-001 … F-023), plus a W4-prep unit (shared number field), merged to `main`.
- Every unit had: one builder in a worktree, one code review (F-015 also a security audit), review fixes, merge, and the full `pnpm check`.
- Owner reviews after each wave: waves 0–5. All recommendations were accepted, and the decisions are written into the specs (changelog 2026-11-05 … 2026-11-20).

## Automated checks
| Check | Result | Evidence |
|---|---|---|
| `pnpm check` (spec lint, codegen, typecheck, lint+format, unit+property, build, licence audit + dist scan, size budgets, e2e Chromium+WebKit) | **pass, 9/9** | merge `61c3038`: 1060 unit tests, 927 e2e passed, 0 failed (29.8 min at 1 worker) |
| `pnpm check:realtime` (A/V sync, worklet underruns, NFR-02/03/04 timings) | **pass** | 17 passed, 1 skipped by design |
| `spec_lint` | **0 errors, 0 warnings** | 811 IDs |
| AC coverage (`spec_lint --coverage tests`) | **all but 1** | F-001.AC9 is device-only and listed below |
| Security audit (F-015 export) | **no critical, high or medium findings**; lows fixed | review of `worktree-agent-a1b64e83…` |
| Size | within every budget | code 433 / 560 KB; fonts + looks within budget; music 1.8 / 10 MB |

## Choices made
All owner decisions are recorded in `.build-my-app/reports/build-spec-questions.md` (Q1–Q209) and applied to `specs/`.

## Still open (carried to QA, phase 5)
- **Manual device checks:** the "Manual device checks (QA)" section of `build-spec-questions.md`. It covers:
  - iPhone: touch, the keyboard above the text bar, minus key, Share, the leave warning standalone vs embedded;
  - Safari: Cmd+O, slider detent;
  - Android;
  - reference laptop and phone timings (NFR-02/03/04);
  - F-001.AC9: a 3.5 GB 4K file on the reference phone (NFR-05).
- **QA-open technical items:** Q25 (decoder fallback, phone), Q39 (colour-range tag), Q45 (AAC estimate on real music), Q172 (text-bitmap memory cap across layers).
- **Release blocker by design:** placeholder music (DEP-14, 3 tracks, 8+ needed). Owner deferred the CC0 shortlist to pre-release; `check:release` fails until then.

## Feature status
All 23 features are merged and pass their automated acceptance tests. On approval, their status moves `building` → `shipped`. The device checks above stay tracked in QA.
