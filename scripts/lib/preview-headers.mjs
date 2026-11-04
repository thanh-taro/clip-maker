// MOD-Build — serves `dist/_headers` from `vite preview` (local release preview, ADR-0014), so the
// local e2e runs under the real CSP, Permissions-Policy and caching headers instead of none. Supports
// the subset the generator writes: path rules (`/*`, `/assets/*`, exact paths), `Name: value` lines and
// `! Name` detaches. Never used by the dev server or the deployed site (Cloudflare reads _headers).
import fs from 'node:fs';
import path from 'node:path';

/** Parses a `_headers` file into [{ pattern: RegExp, set: [name, value][], detach: string[] }]. */
export function parseHeaders(text) {
  const rules = [];
  let rule = null;
  for (const raw of text.split('\n')) {
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      const glob = raw.trim();
      const re = new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
      rule = { pattern: re, set: [], detach: [] };
      rules.push(rule);
      continue;
    }
    const line = raw.trim();
    if (!rule) continue;
    if (line.startsWith('!')) rule.detach.push(line.slice(1).trim().toLowerCase());
    else {
      const i = line.indexOf(':');
      rule.set.push([line.slice(0, i).trim(), line.slice(i + 1).trim()]);
    }
  }
  return rules;
}

/** The headers for one request path, applying every matching rule in order. */
export function headersFor(rules, urlPath) {
  const out = new Map();
  for (const r of rules) {
    if (!r.pattern.test(urlPath)) continue;
    for (const d of r.detach) out.delete(d);
    for (const [name, value] of r.set) out.set(name.toLowerCase(), [name, value]);
  }
  return [...out.values()];
}

/** @returns {import('vite').Plugin} */
export function previewHeaders() {
  return {
    name: 'tk-preview-headers',
    configurePreviewServer(server) {
      const file = path.join(server.config.root, server.config.build.outDir, '_headers');
      if (!fs.existsSync(file)) return;
      const rules = parseHeaders(fs.readFileSync(file, 'utf8'));
      server.middlewares.use((req, res, next) => {
        const urlPath = (req.url ?? '/').split('?')[0];
        for (const [name, value] of headersFor(rules, urlPath)) res.setHeader(name, value);
        next();
      });
    },
  };
}
