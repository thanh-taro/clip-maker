# Tests adapter

How tests consume the specs (ADR-0016). Copied from the sibling image-annotator and adapted. Every
acceptance criterion needs a test whose **title starts with its ID**;
`python3 tools/spec_lint.py --coverage tests` lists criteria without one.

## Naming convention
- Title = `<spec ID> <behaviour in plain words>`, with the dotted form exactly as in the spec:
  `F-015.AC2 a 4 MB target on a 60 s project offers 480p only`.
- Rules, invariants, NFRs, modules and ADRs use their IDs the same way: `RULE-22 each missing
  capability is reported`, `NFR-01 the CSP refuses a fetch to another origin`, `MOD-Plan …`.
- One criterion per test where practical; a test covering several lists each ID.
- Parametrised variants append the parameter in parentheses: `… (light)`; Playwright adds the
  engine (`[chromium]`, `[webkit]`) itself.
- Harness checks that verify no spec item start with `smoke:`. A test only cites an acceptance
  criterion once the behaviour it checks is built; scaffold tests cite the module or rule they cover.
- In code under test, cite what it implements: `// Implements: F-003.R2`.
- File names: `<module>.<topic>.test.ts` (unit/property), `<flow or feature>.spec.ts` (e2e).

## Layout
| Folder | Runner | What |
|---|---|---|
| `tests/unit/` | Vitest (Node) | MOD-Core rule maths and tables, MOD-Plan, MOD-Project operations and undo, MOD-Keys, MOD-Copy, MOD-Host pure functions, MOD-Assets' fetch guard, DSP against analytic signals (resampler, WSOLA 440 Hz, limiter, WAV), the compositor CPU reference, the generators |
| `tests/property/` | Vitest + fast-check | rule invariants (INV-03/04/06), undo/redo round trips, frame-time maths across 24/25/30/60 fps |
| `tests/e2e/*.spec.ts` | Playwright on `pnpm preview` of `dist/` with the generated `_headers` | shell smoke, flows, golden frames, request log (NFR-01), axe |
| `tests/e2e/support/` | — | ports, minimal Node typings |
| `tests/fixtures/` | — | small deterministic fixtures only; large media (phone HEVC, 4 GB pair, 5K) live outside git with checksums in a manifest (ADR-0016 §5) |

## End-to-end setup
- `pnpm build`, then `pnpm test:e2e` (`--project=chromium|webkit`). `playwright.config.ts` serves
  `dist/` with `pnpm preview --strictPort` on a per-worktree port (30000–31999, from
  `tests/e2e/support/ports.ts`; `E2E_PORT` overrides; a running server is reused only with
  `E2E_REUSE=1`). `vite preview` sends `dist/_headers` (scripts/lib/preview-headers.mjs), so the CSP
  under test is the real one.
- Engines (ADR-0016 outcome): Playwright's Chromium (H.264/AAC on macOS, software WebGL; logic and
  codec e2e only), WebKit, and the opt-in branded **Chrome** (`E2E_CHROME=1 pnpm test:e2e
  --project=chrome`, DEP-34, D-035) for HEVC, GPU fidelity and timing. WebKit e2e that touch OPFS
  need a persistent context. Gecko, iOS and Android are manual (ADR-0016 §7).
- Requests to any other origin are aborted by the tests (`page.route`) and recorded; the NFR-01
  check expects none, and a deliberate cross-origin `fetch` must raise a `connect-src` violation.
- Accessibility: `@axe-core/playwright` with tags `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa`;
  zero violations expected (NFR-06).
- No code-host workflows (ADR-0002 §5): every suite runs locally (`pnpm check`).
- Still to come (ADR-0016): the multi-origin host stub (RULE-17 frame tests), offline, golden-frame
  and A/V fixtures, scratch inspection, the fixtures page/worker that makes the chart and clap
  fixtures with our own encoder.

## Device support (RULE-22, F-023)
An unsupported device is simulated without any hook in the production build:
- **Unit:** MOD-App's start-up check takes a `DeviceDeps` (`features`, `codecs`, `effects`; `src/app/device.ts`),
  so `tests/unit/app.device.test.ts` passes fake interface presence, capability records and effects answers.
- **Production build (e2e):** the presence check and the MOD-Codec probe run on the main thread, so
  `page.addInitScript` removes or refuses interfaces before the app loads: delete `VideoDecoder` (no decode),
  make `VideoEncoder.isConfigSupported` / `AudioEncoder.isConfigSupported` answer `supported: false` (no video /
  sound encoder), return `null` for `getContext('webgl2')` (no WebGL2), delete every codec interface with a
  Firefox Android user agent (the Gecko Android browser). See `tests/e2e/device-support.spec.ts`.
- **App harness (e2e):** the effects check runs in the engine worker, whose globals a test can't change.
  `tests/harness/app.html` (dev server only, never in `dist/`) boots the real `main()` with the browser's device
  except the effects answers, set by the address: `?effects=slow`, `?effects=fail`, or `?effects=pending` (no
  answer and no timeout until the test calls `window.appHarness.draw()`); `window.appHarness.workers()` counts
  the running workers.
- Software WebGL (SwiftShader, llvmpipe — Playwright's Chromium) is slow by the rule. Tests that need a fast,
  reference-class renderer skip by renderer (`WEBGL_debug_renderer_info`), not by browser name; the NFR-02
  timing test is `@realtime` (`pnpm check:realtime`).

## Performance
- `pnpm check:realtime` — the tests tagged `@realtime` (wall-clock: A/V sync, export speed, worklet
  underruns), serially on one engine at a time. `pnpm check` leaves them out because parallel builds load
  the machine; they run on a quiet machine at every wave gate and in QA.
- `pnpm check:size` — compressed budgets on every build (NFR-10, architecture.md "Size").
- Lighthouse (NFR-02) and the NFR-03/04/05 timing suites run before release (ADR-0016 §6), on a quiet
  host with the load average recorded.
