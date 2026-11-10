// Build configuration (ADR-0002 §2, ADR-0003, MOD-Build). Copied from the sibling image-annotator and
// adapted: four dedicated module workers plus the per-export pair and the audio worklet module, all
// hashed same-origin files (`worker.format: 'es'`); the inline boot script; the offline worker and
// asset manifest (ADR-0015); `vite preview` sends dist/_headers (local release preview). No dynamic import and no lazy chunks (ADR-0002; checked by check-size).
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';
// @ts-expect-error -- plain ESM build script without type declarations
import { readBootScript } from './scripts/lib/boot.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { hostOrigins } from './scripts/gen-headers.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { offline } from './scripts/lib/offline.mjs';
// @ts-expect-error -- plain ESM build script without type declarations
import { previewHeaders } from './scripts/lib/preview-headers.mjs';

/** Inlines the boot script (MOD-Host) at the top of <head>; its hash is in public/_headers. */
function bootScript(): Plugin {
  return {
    name: 'tk-boot-script',
    transformIndexHtml(html) {
      return html.replace('<!--boot-->', `<script>${readBootScript() as string}</script>`);
    },
  };
}

export default defineConfig({
  plugins: [preact(), bootScript(), offline() as Plugin, previewHeaders() as Plugin],
  define: {
    __HOST_ORIGINS__: JSON.stringify(hostOrigins()),
  },
  build: {
    target: 'es2022',
    // The polyfill uses fetch; all targets support modulepreload.
    modulePreload: { polyfill: false },
    manifest: true,
    // Hidden maps feed the dist licence scan (scripts/check-dist.mjs); .assetsignore keeps them off the host.
    sourcemap: 'hidden',
    assetsInlineLimit: 0,
  },
  worker: { format: 'es' },
  preview: { port: 4173, strictPort: true },
  server: { port: 5173, strictPort: true },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/property/**/*.test.ts'],
    environment: 'node',
    // DSP and property tests take ~1 s idle; a busy machine can push them past Vitest's 5 s default.
    // They assert results, not speed (wall-clock checks are the @realtime e2e tests).
    testTimeout: 20_000,
  },
});
