// Release check of the build's host allow-list and tool origin (RULE-17, NFR-09, ADR-0014; qa-security L1).
// `pnpm check:release` runs it on dist/: the release build must have been made with the production values,
// never with a local HOST_ORIGINS or TOOL_ORIGIN left in the shell. It fails unless
//  - dist/_headers' page CSP has `frame-ancestors` exactly the production host list (https://tarokit.app),
//    and the Trusted Types directives of QA-3;
//  - the `/assets/*` Access-Control-Allow-Origin is exactly the production tool origin;
//  - the origins compiled into the main chunk (MOD-Host's allow-list, vite.config.ts `__HOST_ORIGINS__`) are
//    exactly the production host list.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abs } from './lib/util.mjs';
import { headersFor, parseHeaders } from './lib/preview-headers.mjs';
import { DEFAULT_HOST_ORIGINS, DEFAULT_TOOL_ORIGIN, parseHostOrigins, TRUSTED_TYPES_POLICY } from './gen-headers.mjs';

/** An origin-only string literal (scheme, host, optional port; no path) in minified code. */
const ORIGIN_LITERAL = /[`'"](https?:\/\/[^/`'"\s]+)[`'"]/g;

const sameList = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * @param {string} distDir
 * @param {{ hosts?: string[], tool?: string }} [production] the production values (defaults: gen-headers.mjs)
 * @returns {string[]} problems
 */
export function checkReleaseHeaders(
  distDir,
  { hosts = parseHostOrigins(DEFAULT_HOST_ORIGINS), tool = DEFAULT_TOOL_ORIGIN } = {},
) {
  const problems = [];
  const file = path.join(distDir, '_headers');
  if (!fs.existsSync(file)) return [`${file} is missing`];
  const rules = parseHeaders(fs.readFileSync(file, 'utf8'));
  const get = (urlPath, name) => headersFor(rules, urlPath).find(([n]) => n.toLowerCase() === name)?.[1];

  const csp = get('/', 'content-security-policy') ?? '';
  const directives = new Map(
    csp
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .filter((d) => d[0])
      .map(([name, ...values]) => [name, values]),
  );
  const ancestors = directives.get('frame-ancestors') ?? [];
  if (!sameList(ancestors, hosts))
    problems.push(`frame-ancestors is "${ancestors.join(' ')}", not the production "${hosts.join(' ')}" (RULE-17)`);
  if ((directives.get('require-trusted-types-for') ?? []).join(' ') !== "'script'")
    problems.push("the page CSP lacks require-trusted-types-for 'script' (QA-3, ADR-0014)");
  if ((directives.get('trusted-types') ?? []).join(' ') !== TRUSTED_TYPES_POLICY)
    problems.push(`the page CSP's trusted-types is not exactly "${TRUSTED_TYPES_POLICY}" (QA-3, ADR-0014)`);

  const acao = get('/assets/index.js', 'access-control-allow-origin');
  if (acao !== tool)
    problems.push(`/assets/* Access-Control-Allow-Origin is "${acao ?? ''}", not the production ${tool} (A3)`);

  const html = fs.existsSync(path.join(distDir, 'index.html'))
    ? fs.readFileSync(path.join(distDir, 'index.html'), 'utf8')
    : '';
  const main = /<script type="module"[^>]*src="\/(assets\/index-[\w-]+\.js)"/.exec(html)?.[1];
  if (!main) problems.push('index.html loads no main chunk (assets/index-*.js)');
  else {
    const code = fs.readFileSync(path.join(distDir, main), 'utf8');
    const compiled = [...new Set([...code.matchAll(ORIGIN_LITERAL)].map((m) => m[1]))];
    if (!sameList(compiled, hosts))
      problems.push(
        `the main chunk's compiled origins are "${compiled.join(' ')}", not the production "${hosts.join(' ')}" (HOST_ORIGINS at build time, RULE-17)`,
      );
  }
  return problems;
}

// CLI: `node scripts/check-release-headers.mjs` (after `pnpm build`); `pnpm check:release` runs it too.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = checkReleaseHeaders(abs('dist'));
  if (problems.length) {
    console.error(problems.map((p) => `✗ ${p}`).join('\n'));
    process.exit(1);
  }
  console.log('release headers: production host allow-list and tool origin');
}
