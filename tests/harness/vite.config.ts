// Vite dev server for the media harness (tests/harness): serves the test page and the real source
// modules and workers (src/), untouched. Started by playwright.config.ts on MEDIA_HARNESS_PORT.
import { defineConfig } from 'vite';

const repo = new URL('../../', import.meta.url).pathname;

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  server: { strictPort: true, fs: { allow: [repo] } },
  worker: { format: 'es' },
  optimizeDeps: { include: ['mediabunny'] },
  logLevel: 'warn',
});
