# Gate G3: Architecture, foundations and spikes

| Check | Result | Evidence |
|---|---|---|
| A fresh clone sets up and runs | pass | A clean clone ran `pnpm bootstrap` then `pnpm check`: all 9 steps passed, including e2e on Chromium and WebKit. The shell renders at `pnpm preview`. |
| CI green | pass | spec lint, codegen up to date, typecheck, lint, unit tests, build, strict licence gate, size budgets, e2e smoke |
| All spikes closed with ADRs | pass | All 13 spikes have adopt or adapt verdicts recorded in ADR Outcome sections. ADR-0001…0016 accepted (D-043). Spec changes SC-1…11 applied (D-044…046). |
| Every dependency approved | pass, with exceptions | 35 approved. DEP-26 (@lhci/cli) needs the owner: Lighthouse pulls in FSL-licensed `sentry` and PSF-licensed `argparse`, and it is not installed. DEP-12 (portal tokens) needs owner confirmation. DEP-13 (looks) and DEP-14 (music) are build-phase assets. |

## Open items carried into the build
- Phone export at 4K runs at 0.43× real time, because wrapping each canvas as a `VideoFrame` dominates.
- Phone peak memory in MB is not yet measured.
- Android is untested.
- Owner checks still to do: floor stills, the chart MP4 player check, and look sign-off.
- Music curation (D-034).
