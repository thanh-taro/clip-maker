// TEMPORARY (F-010 iteration only, never committed): the media harness alone.
import { defineConfig, devices } from '@playwright/test';
import { MEDIA_HARNESS_PORT } from './tests/e2e/support/ports';
export default defineConfig({
  testDir: './tests/e2e',
  workers: Math.max(1, Number(process.env['BMA_TEST_WORKERS']) || 2),
  timeout: 60_000,
  reporter: [['list']],
  webServer: [
    {
      command: `pnpm exec vite --config tests/harness/vite.config.ts --port ${MEDIA_HARNESS_PORT}`,
      url: `http://localhost:${MEDIA_HARNESS_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
  projects: [
    { name: 'chromium', grepInvert: /@realtime/, use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', grepInvert: /@realtime/, use: { ...devices['Desktop Safari'] } },
  ],
});
