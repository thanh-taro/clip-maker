// End-to-end tests (ADR-0016, adapters/tests.md): the production build served by `vite preview` with
// the generated `_headers` (real CSP; scripts/lib/preview-headers.mjs), on Chromium and WebKit.
// Run `pnpm build` first. Test titles start with the spec ID they verify (or `smoke:`).
// The branded Chrome (`channel: 'chrome'`, DEP-34, owner decision D-035; H.264/HEVC, GPU timing) is an
// opt-in project: `E2E_CHROME=1 pnpm test:e2e --project=chrome`.
import { defineConfig, devices } from '@playwright/test';
import { HOST_PORT_BASE, MEDIA_HARNESS_PORT, OFFLINE_PORT_BASE, PREVIEW_PORT } from './tests/e2e/support/ports';
import { HOST_ALLOWED } from './tests/e2e/support/host-urls';

const CI = !!process.env['CI'];
const PORT = PREVIEW_PORT;
// Each worker is a browser decoding video, painting WebGL and exporting: about 1 GB at peak. The
// machine's budget comes from the heavy-run wrapper (BMA_TEST_WORKERS, build-my-app bma_heavy.py);
// without it, 1. Two browsers exporting real video at once crashed the 16 GB laptop (2026-11-16 and
// 2026-11-20), so the e2e suite runs one browser at a time.
const WORKERS = Math.max(1, Number(process.env['BMA_TEST_WORKERS']) || 1);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: WORKERS,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  timeout: 30_000,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    // Serves the production build (dist/). Build it first: `pnpm build`.
    {
      command: `pnpm preview --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      // Reusing a running server only on request (E2E_REUSE=1): it could be another checkout's build.
      reuseExistingServer: !!process.env['E2E_REUSE'],
      timeout: 60_000,
    },
    // The media harness (tests/harness, ADR-0016 §4): src/ modules and workers under the dev server.
    {
      command: `pnpm exec vite --config tests/harness/vite.config.ts --port ${MEDIA_HARNESS_PORT}`,
      url: `http://localhost:${MEDIA_HARNESS_PORT}`,
      reuseExistingServer: !!process.env['E2E_REUSE'],
      timeout: 60_000,
    },
    // The multi-origin host harness (RULE-17 frame tests, F-019): builds dist-e2e/host allow-listing a
    // stub portal and serves both with real headers (tests/e2e/support/host-harness.mjs). It also starts
    // the offline harness (F-021: the same build, a published version 2, and the export harness built
    // with the offline worker; tests/e2e/support/offline-servers.mjs).
    {
      command: 'node tests/e2e/support/host-harness.mjs',
      url: `${HOST_ALLOWED}/host.html`,
      env: { E2E_HOST_PORT_BASE: String(HOST_PORT_BASE), E2E_OFFLINE_PORT_BASE: String(OFFLINE_PORT_BASE) },
      reuseExistingServer: !!process.env['E2E_REUSE'],
      timeout: 120_000,
    },
  ],
  // Real-time tests (tag @realtime: A/V sync, worklet underruns) measure wall-clock timing, so they
  // run after the parallel suite, one engine at a time, instead of competing with it for the CPU.
  // They keep their strict thresholds but may retry twice: a busy laptop can stall one 3 s window.
  projects: [
    { name: 'chromium', grepInvert: /@realtime/, use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', grepInvert: /@realtime/, use: { ...devices['Desktop Safari'] } },
    {
      name: 'chromium-realtime',
      grep: /@realtime/,
      retries: 2,
      dependencies: ['chromium', 'webkit'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit-realtime',
      grep: /@realtime/,
      retries: 2,
      dependencies: ['chromium-realtime'],
      use: { ...devices['Desktop Safari'] },
    },
    ...(process.env['E2E_CHROME']
      ? [
          // F-021's offline servers are per engine (chromium, webkit): the chrome project would share
          // Chromium's request log and published version, so the offline tests run on those two only.
          { name: 'chrome', grepInvert: /F-021/, use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
        ]
      : []),
  ],
});
