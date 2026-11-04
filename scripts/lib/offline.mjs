// MOD-Build — offline support in the build (ADR-0015). Adapted from the sibling image-annotator:
// emits src/host/sw.ts as the stable, unhashed /sw.js (headers: scripts/gen-headers.mjs) and checks it
// is a classic script, and writes `asset-manifest.json`: every file the tool can need, for the
// service worker's precache and MOD-Assets' fetch allow-list (ADR-0015 "Decision"). Looks and music
// join the manifest when they are packed (ADR-0013).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { abs } from './util.mjs';

export const SW_SOURCE = 'src/host/sw.ts';
export const SW_FILE = 'sw.js';
export const MANIFEST_FILE = 'asset-manifest.json';
/** Never precached: the worker itself, the manifest, source maps and the Vite manifest. */
const EXCLUDED = (f) => f === SW_FILE || f === MANIFEST_FILE || f.endsWith('.map') || f.startsWith('.vite/');

const hash = (data) => crypto.createHash('sha256').update(data).digest('base64url').slice(0, 16);

/** @returns {import('vite').Plugin} */
export function offline() {
  let build = false;
  let publicDir = abs('public');
  return {
    name: 'tk-offline',
    enforce: 'post',
    config: (_config, { command }) => {
      build = command === 'build';
    },
    configResolved(config) {
      publicDir = config.publicDir;
    },
    buildStart() {
      if (build) this.emitFile({ type: 'chunk', id: abs(SW_SOURCE), fileName: SW_FILE });
    },
    generateBundle(_options, bundle) {
      if (!build) return;
      const sw = bundle[SW_FILE];
      if (!sw || sw.type !== 'chunk') throw new Error(`offline: ${SW_FILE} was not emitted`);
      if (/^\s*(import|export)\b/m.test(sw.code)) {
        throw new Error(`offline: ${SW_FILE} must be a classic script (it imports code shared with the page)`);
      }
      const files = {};
      for (const [name, out] of Object.entries(bundle)) {
        if (EXCLUDED(name)) continue;
        files[`/${name}`] = hash(out.type === 'chunk' ? out.code : out.source);
      }
      if (fs.existsSync(publicDir)) {
        for (const name of fs.readdirSync(publicDir)) {
          if (name.startsWith('.') || name === '_headers' || EXCLUDED(name)) continue;
          files[`/${name}`] = hash(fs.readFileSync(path.join(publicDir, name)));
        }
      }
      const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
      this.emitFile({
        type: 'asset',
        fileName: MANIFEST_FILE,
        source: JSON.stringify({ version: 1, files: sorted }, null, 2) + '\n',
      });
    },
  };
}
