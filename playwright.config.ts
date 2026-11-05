// End-to-end tests (ADR-0016, adapters/tests.md): the production build served by `vite preview` with
// the generated `_headers` (real CSP; scripts/lib/preview-headers.mjs), on Chromium and WebKit.
// Run `pnpm build` first. Test titles start with the spec ID they verify (or `smoke:`).
// The branded Chrome (`channel: 'chrome'`, DEP-34, owner decision D-035; H.264/HEVC, GPU timing) is an
// opt-in project: `E2E_CHROME=1 pnpm test:e2e --project=chrome`.
import { defineConfig, devices } from '@playwright/test';
import { MEDIA_HARNESS_PORT, PREVIEW_PORT } from './tests/e2e/support/ports';

const CI = !!process.env['CI'];
const PORT = PREVIEW_PORT;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
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
  ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    ...(process.env['E2E_CHROME']
      ? [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }]
      : []),
  ],
});
