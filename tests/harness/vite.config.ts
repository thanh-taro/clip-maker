// Vite dev server for the media harness (tests/harness): serves the test pages and the real source
// modules and workers (src/), untouched. Started by playwright.config.ts on MEDIA_HARNESS_PORT.
// app.html boots the real MOD-App `main()` with an injected device (F-023 tests), so it needs the
// Preact JSX transform, the inline boot script (theme and language before first paint) and an empty
// host allow-list (standalone).
// TK_HARNESS_BUILD=offline (tests/e2e/support/offline-servers.mjs, F-021): a production build of the
// export harness page (index.html) with the offline worker and asset manifest, served by the offline
// harness so an export can run from the offline copy. Never part of dist/.
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';
// @ts-expect-error -- plain ESM build script without type declarations
import { readBootScript } from '../../scripts/lib/boot.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { offline } from '../../scripts/lib/offline.mjs';

const repo = new URL('../../', import.meta.url).pathname;
/** The build's environment (no Node typings in this project's tsconfig). */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

function bootScript(): Plugin {
  return {
    name: 'tk-boot-script',
    transformIndexHtml(html) {
      return html.replace('<!--boot-->', `<script>${readBootScript() as string}</script>`);
    },
  };
}

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  plugins: [
    preact({ prefreshEnabled: false }),
    bootScript(),
    ...(env['TK_HARNESS_BUILD'] === 'offline' ? [offline() as Plugin] : []),
  ],
  build: { target: 'es2022', modulePreload: { polyfill: false }, assetsInlineLimit: 0 },
  define: { __HOST_ORIGINS__: '[]' },
  server: { strictPort: true, fs: { allow: [repo] } },
  worker: { format: 'es' },
  optimizeDeps: { include: ['mediabunny'] },
  logLevel: 'warn',
});
